/* --------------------------------------------------------------------------------------------
 * Copyright (c) 2018 TypeFox GmbH (http://www.typefox.io). All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import * as fs from 'fs';
import { xhr, getErrorStatusDescription } from 'request-light';
import { URI } from 'vscode-uri';
import { MessageReader, MessageWriter } from 'vscode-jsonrpc';
import { IConnection, TextDocuments, createConnection } from 'vscode-languageserver';
import {
  TextDocument,
  Diagnostic,
  //Command,
  CompletionList,
  //CompletionItem,
  Hover,
  // Range,
  // SymbolInformation,
  // TextEdit,
  // FoldingRange,
  // ColorInformation,
  // ColorPresentation,
  Position,
  //DiagnosticSeverity,
  CompletionItemKind,
} from 'vscode-languageserver-types';
import {
  TextDocumentPositionParams,
  // DocumentRangeFormattingParams,
  // ExecuteCommandParams,
  // CodeActionParams,
  // FoldingRangeRequestParam,
  // DocumentColorParams,
  // ColorPresentationParams,
} from 'vscode-languageserver-protocol';
import * as lg from 'botbuilder-lg';
import { buildInfunctionsMap } from './builtinFunctions';
import { getRangeAtPosition, convertSeverity, getLGResources } from './utils';

export function start(reader: MessageReader, writer: MessageWriter): LgServer {
  const connection = createConnection(reader, writer);
  const server = new LgServer(connection);
  server.start();
  return server;
}

export class LgServer {
  protected workspaceRoot: URI | undefined;

  protected readonly documents = new TextDocuments();

  // protected readonly jsonService: LanguageService = getLanguageService({
  //     schemaRequestService: this.resovleSchema.bind(this)
  // });

  protected readonly pendingValidationRequests = new Map<string, number>();

  constructor(protected readonly connection: IConnection) {
    this.documents.listen(this.connection);
    this.documents.onDidChangeContent(change => this.validate(change.document));
    this.documents.onDidClose(event => {
      this.cleanPendingValidation(event.document);
      this.cleanDiagnostics(event.document);
    });

    this.connection.onInitialize(params => {
      if (params.rootPath) {
        this.workspaceRoot = URI.file(params.rootPath);
      } else if (params.rootUri) {
        this.workspaceRoot = URI.parse(params.rootUri);
      }
      this.connection.console.log('The server is initialized.');
      return {
        capabilities: {
          textDocumentSync: this.documents.syncKind,
          codeActionProvider: true,
          completionProvider: {
            resolveProvider: true,
            // triggerCharacters: ['(', '[']
          },
          hoverProvider: true,
          documentSymbolProvider: true,
          documentRangeFormattingProvider: true,
          // executeCommandProvider: {
          //     commands: ['json.documentUpper']
          // },
          colorProvider: true,
          foldingRangeProvider: false,
        },
      };
    });
    // this.connection.onCodeAction(params =>
    //     this.codeAction(params)
    // );
    this.connection.onCompletion(params => this.completion(params));
    // this.connection.onCompletionResolve(item =>
    //     this.resolveCompletion(item)
    // );
    // this.connection.onExecuteCommand(params =>
    //     this.executeCommand(params)
    // );
    this.connection.onHover(params => this.hover(params));
    // this.connection.onDocumentSymbol(params =>
    //     this.findDocumentSymbols(params)
    // );
    // this.connection.onDocumentRangeFormatting(params =>
    //     this.format(params)
    // );
    // this.connection.onDocumentColor(params =>
    //     this.findDocumentColors(params)
    // );
    // this.connection.onColorPresentation(params =>
    //     this.getColorPresentations(params)
    // );
    // this.connection.onFoldingRanges(params =>
    //     this.getFoldingRanges(params)
    // );
  }

  start() {
    this.connection.listen();
  }

  // protected getFoldingRanges(params: FoldingRangeRequestParam): FoldingRange[] {
  //     const document = this.documents.get(params.textDocument.uri);
  //     if (!document) {
  //         return [];
  //     }
  //     return this.jsonService.getFoldingRanges(document);
  // }

  // protected findDocumentColors(params: DocumentColorParams): Thenable<ColorInformation[]> {
  //     const document = this.documents.get(params.textDocument.uri);
  //     if (!document) {
  //         return Promise.resolve([]);
  //     }
  //     const jsonDocument = this.getJSONDocument(document);
  //     return this.jsonService.findDocumentColors(document, jsonDocument);
  // }

  // protected getColorPresentations(params: ColorPresentationParams): ColorPresentation[] {
  //     const document = this.documents.get(params.textDocument.uri);
  //     if (!document) {
  //         return [];
  //     }
  //     const jsonDocument = this.getJSONDocument(document);
  //     return this.jsonService.getColorPresentations(document, jsonDocument, params.color, params.range);
  // }

  // protected codeAction(params: CodeActionParams): Command[] {
  //     const document = this.documents.get(params.textDocument.uri);
  //     if (!document) {
  //         return [];
  //     }
  //     return [{
  //         title: "Upper Case Document",
  //         command: "json.documentUpper",
  //         // Send a VersionedTextDocumentIdentifier
  //         arguments: [{
  //             ...params.textDocument,
  //             version: document.version
  //         }]
  //     }];
  // }

  // protected format(params: DocumentRangeFormattingParams): TextEdit[] {
  //     const document = this.documents.get(params.textDocument.uri);
  //     return document ? this.jsonService.format(document, params.range, params.options) : [];
  // }

  // protected findDocumentSymbols(params: any): SymbolInformation[] {
  //     const document = this.documents.get(params.textDocument.uri);
  //     if (!document) {
  //         return [];
  //     }
  //     const jsonDocument = this.getJSONDocument(document);
  //     return this.jsonService.findDocumentSymbols(document, jsonDocument);
  // }

  // protected executeCommand(params: ExecuteCommandParams): any {
  //     if (params.command === "json.documentUpper" && params.arguments) {
  //         const versionedTextDocumentIdentifier = params.arguments[0];
  //         const document = this.documents.get(versionedTextDocumentIdentifier.uri);
  //         if (document) {
  //             this.connection.workspace.applyEdit({
  //                 documentChanges: [{
  //                     textDocument: versionedTextDocumentIdentifier,
  //                     edits: [{
  //                         range: {
  //                             start: { line: 0, character: 0 },
  //                             end: { line: Number.MAX_SAFE_INTEGER, character: Number.MAX_SAFE_INTEGER }
  //                         },
  //                         newText: document.getText().toUpperCase()
  //                     }]
  //                 }]
  //             });
  //         }
  //     }
  // }

  protected hover(params: TextDocumentPositionParams): Thenable<Hover | null> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve(null);
    }
    const lgResources = getLGResources(document);
    const templates = lgResources.Templates;
    const hoverItemList = [];
    const wordRange = getRangeAtPosition(document, params.position);
    let word = document.getText(wordRange);
    const matchItem: lg.LGTemplate = templates.find(u => u.Name === word);
    if (matchItem !== undefined) {
      const hoveritem: Hover = { contents: [matchItem.Source, matchItem.Body] };
      return Promise.resolve(hoveritem);
    }
    if (word.indexOf('builtin.') == 0) {
      word = word.substring('builtin.'.length);
    }

    if (buildInfunctionsMap.has(word)) {
      const functionEntity = buildInfunctionsMap.get(word);
      const hoveritem: Hover = {
        contents: [
          `Parameters: ${functionEntity.Params.join(', ')}`,
          `Documentation: ${functionEntity.Introduction}`,
          `ReturnType: ${functionEntity.Returntype.valueOf()}`,
        ],
      };
      return Promise.resolve(hoveritem);
    }
  }

  protected async resovleSchema(url: string): Promise<string> {
    const uri = URI.parse(url);
    if (uri.scheme === 'file') {
      return new Promise<string>((resolve, reject) => {
        fs.readFile(uri.fsPath, 'UTF-8', (err, result) => {
          err ? reject('') : resolve(result.toString());
        });
      });
    }
    try {
      const response = await xhr({ url, followRedirects: 5 });
      return response.responseText;
    } catch (error) {
      return Promise.reject(error.responseText || getErrorStatusDescription(error.status) || error.toString());
    }
  }

  // protected resolveCompletion(item: CompletionItem): Thenable<CompletionItem> {
  //     return this.jsonService.doResolve(item);
  // }

  protected completion(params: TextDocumentPositionParams): Thenable<CompletionList | null> {
    const document = this.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve(null);
    }
    const lgResources = getLGResources(document);
    const templates = lgResources.Templates;
    const completionList = [];
    templates.forEach(template => {
      const item = {
        label: template.Name,
        kind: CompletionItemKind.Reference,
        insertText:
          template.Parameters.length > 0 ? template.Name + '(' + template.Parameters.join(', ') + ')' : template.Name,
        documentation: template.Body,
      };
      completionList.push(item);
    });

    buildInfunctionsMap.forEach((value, key) => {
      const item = {
        label: key,
        kind: CompletionItemKind.Function,
        insertText: key + '(' + value.Params.toString() + ')',
        documentation: value.Introduction,
      };
      completionList.push(item);
    });

    return Promise.resolve({ isIncomplete: true, items: completionList });
    //return this.jsonService.doComplete(document, params.position, jsonDocument);
  }

  protected validate(document: TextDocument): void {
    this.cleanPendingValidation(document);
    this.pendingValidationRequests.set(
      document.uri,
      setTimeout(() => {
        this.pendingValidationRequests.delete(document.uri);
        this.doValidate(document);
      })
    );
  }

  protected cleanPendingValidation(document: TextDocument): void {
    const request = this.pendingValidationRequests.get(document.uri);
    if (request !== undefined) {
      clearTimeout(request);
      this.pendingValidationRequests.delete(document.uri);
    }
  }

  protected doValidate(document: TextDocument): void {
    if (document.getText().length === 0) {
      this.cleanDiagnostics(document);
      return;
    }
    //const jsonDocument = this.getJSONDocument(document);
    // this.jsonService.doValidation(document, jsonDocument).then(diagnostics =>
    //     this.sendDiagnostics(document, diagnostics)
    // );
    let text = document.getText();
    const staticChercher = new lg.StaticChecker();
    const lgDiags = staticChercher.checkText(text, '', lg.ImportResolver.fileResolver);
    let diagnostics: Diagnostic[] = [];
    lgDiags.forEach(diag => {
      let diagnostic: Diagnostic = {
        severity: convertSeverity(diag.Severity),
        range: {
          start: Position.create(diag.Range.Start.Line, diag.Range.Start.Character),
          end: Position.create(diag.Range.End.Line, diag.Range.End.Character),
        },
        message: diag.Message,
        source: document.uri,
      };
      diagnostics.push(diagnostic);
    });

    this.sendDiagnostics(document, diagnostics);
  }

  protected cleanDiagnostics(document: TextDocument): void {
    this.sendDiagnostics(document, []);
  }

  protected sendDiagnostics(document: TextDocument, diagnostics: Diagnostic[]): void {
    this.connection.sendDiagnostics({
      uri: document.uri,
      diagnostics,
    });
  }
}
