// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, commands, TextDocument, Position, TextEditorEdit } from 'vscode';
import { Markdown } from './markdown';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	//console.log('Congratulations, your extension "markdown-toc-generator" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json

	let generateTOCCommand = commands.registerCommand('extension.generateTOC', () => {
		let editor = window.activeTextEditor;
		if (editor) {
			let doc = editor.document;
			let markdown = new Markdown(editor, doc);
			markdown.createOrUpdateTOC();
		}
	});
	context.subscriptions.push(generateTOCCommand);

	let removeTOCCommand = commands.registerCommand('extension.removeTOC', () => {
		let editor = window.activeTextEditor;
		if (editor) {
			let doc = editor.document;
			let markdown = new Markdown(editor, doc);
			markdown.removeTOC();
		}
	});

	context.subscriptions.push(removeTOCCommand);

	let generateHeadingNumbering = commands.registerCommand('extension.generateHeadingNumbering', () => {
		let editor = window.activeTextEditor;
		if (editor) {
			let doc = editor.document;
			let markdown = new Markdown(editor, doc);
			markdown.generateHeadingNumbering();
		}
	});

	context.subscriptions.push(generateHeadingNumbering);
}

// this method is called when your extension is deactivated
export function deactivate() { }
