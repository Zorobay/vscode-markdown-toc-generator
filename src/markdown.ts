import { window, Position, TextDocument, TextEditorEdit, Range, TextLine, InputBoxOptions, TextEditor, DocumentHighlight, TextEdit } from "vscode";

// Define constants to mark start and end of markdown TOC
const TOC_START_COMMENT = "[comment]: # (---START_OF_TOC---)";
const TOC_END_COMMENT = "\n[comment]: # (---END_OF_TOC---)\n";

// Define constant for tab size
const TAB = "   ";

// Define regexps
const REG_HEADING = new RegExp(String.raw`\s{0,3}#{2,6}\s*.+`, 'i');
const REG_HEADING_PARTS = new RegExp(String.raw`(\s*#*)\s([0-9.]*)\s*(.+)`, 'i');
const REG_SPACES = new RegExp(String.raw`\s+`, 'ig');
const REG_DOTS = new RegExp(String.raw`\.`, 'g');
const REG_CHAPTER = /(\s*#{1,6})([0-9.\s]+)(.*)/;

export class Markdown {

    editor: TextEditor;
    document: TextDocument;

    constructor(editor: TextEditor, document: TextDocument) {
        this.editor = editor;
        this.document = document;
    }

    async generateHeadingNumbering() {
        let chapters = [0, 0, 0, 0, 0];
        let prevLevel = 0;

        let chaptersToString = (chapter: number[]) => {
            return chapter.filter(Boolean).join(".");
        };

        await this.editor.edit((editBuilder: TextEditorEdit) => {
            for (let lineIndex: number = 0; lineIndex < this.document.lineCount; lineIndex++) {
                let line = this.document.lineAt(lineIndex);
                if (!line.isEmptyOrWhitespace && this.document.lineAt(lineIndex).text.match(REG_HEADING)) {
                    let heading = new Heading(line.text);
                    let level = heading.getLevel();

                    if (prevLevel > level) {
                        for (let j = level - 1; j < chapters.length; j++) {
                            chapters[j] = 0;
                        }
                    }
                    chapters[level - 2]++;

                    let targetChapter = chaptersToString(chapters);

                    console.log(`Heading: ${heading.heading}, Should be: ${targetChapter}`);
                    if (!heading.getChapter() || heading.getChapter() !== targetChapter) {  // Heading is missing numbering or is wrong
                        let match = REG_CHAPTER.exec(line.text);
                        if (match && match.length === 4) {
                            match[2] = ` ${targetChapter} `;
                            let newHeading = match.slice(1, 4).join("");

                            editBuilder.replace(line.range, newHeading);
                        }

                    }
                    prevLevel = level;
                }
            }
        });
        window.showInformationMessage("Generated/Updated heading numbering!");
    }

    createOrUpdateTOC() {
        let res = this.tocPresent();
        if (res.toc_start > 0) {
            window.showInformationMessage("Updating existing Table of Contents!");
            this.updateTOC(res);
        } else if (res.context > 0) {
            window.showInformationMessage("Creating new Table of Contents!");
            this.insertNewTOC(res.context);
        }
    }

    /**
     * Checks if an existing TOC exists. Returns an object with line number of start of TOC (or -1 if non-existent),
     * end of TOC (or -1 if non-existent) and the line number where the user opened the context menu.
     */
    tocPresent(): { toc_start: number, toc_end: number, context: number } {
        let contextLine: number = -1;
        let tocStartLine: number = -1;
        let tocEndLine: number = -1;


        // Find position of context menu
        contextLine = this.editor.selection.active.line;

        // Walk up to find top comment
        let hasTopComment: boolean = false;
        for (var i = contextLine; i >= 0; i--) {
            if (this.document.lineAt(i).text.includes(TOC_START_COMMENT.trim())) {
                hasTopComment = true;
                tocStartLine = i;
                break;
            }
        }

        // Walk down to find bottom comment if top comment existed
        let hasBottomComment: boolean = false;
        if (hasTopComment) {
            for (i = contextLine; i <= this.document.lineCount; i++) {
                if (this.document.lineAt(i).text.includes(TOC_END_COMMENT.trim())) {
                    hasBottomComment = true;
                    tocEndLine = i;
                    break;
                }
            }
        }

        if (!(hasTopComment && hasBottomComment)) {
            tocStartLine = -1;
        }

        return { toc_start: tocStartLine, toc_end: tocEndLine, context: contextLine };
    }

    async updateTOC(locs: { toc_start: number, toc_end: number, context: number }) {
        if (locs.toc_start > 0 && locs.toc_end > 0 && locs.toc_start < locs.toc_end) {
            await this.replaceTOC(locs.toc_start, locs.toc_end);
        }
    }

    async removeTOC(begin: number=-1, end: number=-1) {
        if (begin < 0) {
            let positions = this.tocPresent();
            if (positions.toc_start > 0) {
                begin = positions.toc_start;
                end = positions.toc_end;
            } else {
                window.showWarningMessage("No Table of Contents found near cursor!");
                return;
            }
        }
        if (this.document.lineAt(begin).text.includes(TOC_START_COMMENT)) {
            await this.editor.edit((editBuilder: TextEditorEdit) => {
                editBuilder.delete(new Range(new Position(begin, 0), new Position(end + 1, 0)));
            });
            window.showInformationMessage("Removed Table of Contents!");
        }
    }

    async replaceTOC(toc_start: number, toc_end: number) {
        let toc = new TableOfContents(this.document);
        let range: Range = new Range(new Position(toc_start, 0), new Position(toc_start + toc.getNumberOfLines() - 1, 0));

        await this.editor.edit((editBuilder: TextEditorEdit) => {
            editBuilder.replace(range, toc.toString());
        });
    }

    async insertNewTOC(toc_start: number) {
        let toc = new TableOfContents(this.document);

        await this.editor.edit((editBuilder: TextEditorEdit) => {
            editBuilder.insert(new Position(toc_start, 0), toc.toString());
        });
    }

    static getBullet(level: number) {
        return (level === 2) ? '* ' : ((level > 2) ? '- ' : '');
    }
}

class TableOfContents {

    document: TextDocument;
    tocLines: string[] = [];

    constructor(document: TextDocument) {
        this.document = document;

        this.buildTOC();
    }

    buildTOC() {
        let tocLines: string[] = [TOC_START_COMMENT];
        let allLines: string[] = this.document.getText().split("\n");

        for (let line of allLines) {
            if (line.match(REG_HEADING)) {
                let header = new Heading(line);
                let level = header.getLevel();
                let chapter = header.getChapter();
                let text = header.getText();
                let anchor = header.getAnchor();
                let bullet = Markdown.getBullet(level);
                tocLines.push(`${TAB.repeat(level - 2)}${bullet}${chapter} [${text.trim()}](#${anchor})`);
            }
        }

        tocLines.push(TOC_END_COMMENT);
        this.tocLines = tocLines;
    }

    toString() {
        return this.tocLines.join("\n");
    }

    getNumberOfLines() {
        let lines: number = 0;
        for (let line of this.tocLines) {
            lines++;
            let newlines = line.match(/\n/g);
            if (newlines) {
                lines = lines + newlines.length;
            }
        }
        return lines;
    }

}

class Heading {

    heading: string;
    level: number = -1;
    chapter: string = '?';
    text: string = '?';

    constructor(heading: string) {
        this.heading = heading;
        let parts = REG_HEADING_PARTS.exec(this.heading);
        if (parts) {
            this.level = parts[1].length;
            this.chapter = parts[2];
            this.text = parts[3];
        }
    }

    getLevel(): number {
        return this.level;
    }

    getChapter(): string {
        return this.chapter;
    }

    getText(): string {
        return this.text;
    }

    getAnchor(): string {
        let anchorBase: string = `${this.chapter} ${this.text}`;
        return anchorBase.replace(REG_DOTS, '').replace(REG_SPACES, '-').toLowerCase();
    }
}

