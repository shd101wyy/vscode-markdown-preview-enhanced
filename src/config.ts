import {
  CodeBlockTheme,
  FrontMatterRenderingOption,
  MathRenderingOption,
  MermaidTheme,
  NotebookConfig,
  ParserConfig,
  PreviewTheme,
  RevealJsTheme,
  getDefaultNotebookConfig,
} from 'crossnote';
import * as vscode from 'vscode';
import { isVSCodeWebExtension } from './utils';

export enum PreviewColorScheme {
  selectedPreviewTheme = 'selectedPreviewTheme',
  systemColorScheme = 'systemColorScheme',
  editorColorScheme = 'editorColorScheme',
}

export class MarkdownPreviewEnhancedConfig implements NotebookConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig();
  }

  public readonly usePandocParser: boolean;
  public readonly breakOnSingleNewLine: boolean;
  public readonly enableTypographer: boolean;
  public readonly enableWikiLinkSyntax: boolean;
  public readonly enableLinkify: boolean;
  public readonly useGitHubStylePipedLink: boolean;
  public readonly wikiLinkFileExtension: string;
  public readonly enableEmojiSyntax: boolean;
  public readonly enableExtendedTableSyntax: boolean;
  public readonly enableCriticMarkupSyntax: boolean;
  public readonly frontMatterRenderingOption: FrontMatterRenderingOption;
  public readonly mathRenderingOption: MathRenderingOption;
  public readonly mathInlineDelimiters: string[][];
  public readonly mathBlockDelimiters: string[][];
  public readonly mathRenderingOnlineService: string;
  public readonly mathjaxV3ScriptSrc: string;
  public readonly codeBlockTheme: CodeBlockTheme;
  public readonly mermaidTheme: MermaidTheme;
  public readonly previewTheme: PreviewTheme;
  public readonly revealjsTheme: RevealJsTheme;
  public readonly protocolsWhiteList: string;
  public readonly imageFolderPath: string;
  public readonly imageUploader: string;
  public readonly printBackground: boolean;
  public readonly chromePath: string;
  public readonly imageMagickPath: string;
  public readonly pandocPath: string;
  public readonly pandocMarkdownFlavor: string;
  public readonly pandocArguments: string[];
  public readonly latexEngine: string;
  public readonly enableScriptExecution: boolean;
  public readonly enableHTML5Embed: boolean;
  public readonly HTML5EmbedUseImageSyntax: boolean;
  public readonly HTML5EmbedUseLinkSyntax: boolean;
  public readonly HTML5EmbedIsAllowedHttp: boolean;
  public readonly HTML5EmbedAudioAttributes: string;
  public readonly HTML5EmbedVideoAttributes: string;
  public readonly puppeteerWaitForTimeout: number;
  public readonly puppeteerArgs: string[];
  public readonly plantumlServer: string;
  public readonly plantumlJarPath: string;
  public readonly hideDefaultVSCodeMarkdownPreviewButtons: boolean;
  public readonly jsdelivrCdnHost: string;
  public readonly krokiServer: string;

  // preview config
  public readonly scrollSync: boolean;
  public readonly liveUpdate: boolean;
  public readonly singlePreview: boolean;
  public readonly automaticallyShowPreviewOfMarkdownBeingEdited: boolean;
  public readonly previewColorScheme: PreviewColorScheme;

  private constructor() {
    const config = vscode.workspace.getConfiguration(
      'markdown-preview-enhanced',
    );
    const defaultConfig = getDefaultNotebookConfig();

    this.usePandocParser = isVSCodeWebExtension()
      ? false // pandoc is not supported in web extension
      : config.get<boolean>('usePandocParser') ?? defaultConfig.usePandocParser;
    this.breakOnSingleNewLine =
      config.get<boolean>('breakOnSingleNewLine') ??
      defaultConfig.breakOnSingleNewLine;
    this.enableTypographer =
      config.get<boolean>('enableTypographer') ??
      defaultConfig.enableTypographer;
    this.enableWikiLinkSyntax =
      config.get<boolean>('enableWikiLinkSyntax') ??
      defaultConfig.enableWikiLinkSyntax;
    this.enableLinkify =
      config.get<boolean>('enableLinkify') ?? defaultConfig.enableLinkify;
    this.useGitHubStylePipedLink =
      config.get<boolean>('useGitHubStylePipedLink') ??
      defaultConfig.useGitHubStylePipedLink;
    this.wikiLinkFileExtension =
      config.get<string>('wikiLinkFileExtension') ??
      defaultConfig.wikiLinkFileExtension;
    this.enableEmojiSyntax =
      config.get<boolean>('enableEmojiSyntax') ??
      defaultConfig.enableEmojiSyntax;
    this.enableExtendedTableSyntax =
      config.get<boolean>('enableExtendedTableSyntax') ??
      defaultConfig.enableExtendedTableSyntax;
    this.enableCriticMarkupSyntax =
      config.get<boolean>('enableCriticMarkupSyntax') ??
      defaultConfig.enableCriticMarkupSyntax;
    this.frontMatterRenderingOption =
      config.get<FrontMatterRenderingOption>('frontMatterRenderingOption') ??
      defaultConfig.frontMatterRenderingOption;
    this.mermaidTheme =
      config.get<MermaidTheme>('mermaidTheme') ?? defaultConfig.mermaidTheme;
    this.mathRenderingOption =
      (config.get<string>('mathRenderingOption') as MathRenderingOption) ??
      defaultConfig.mathRenderingOption;
    this.mathInlineDelimiters =
      config.get<string[][]>('mathInlineDelimiters') ??
      defaultConfig.mathInlineDelimiters;
    this.mathBlockDelimiters =
      config.get<string[][]>('mathBlockDelimiters') ??
      defaultConfig.mathBlockDelimiters;
    this.mathRenderingOnlineService =
      config.get<string>('mathRenderingOnlineService') ??
      defaultConfig.mathRenderingOnlineService;
    this.mathjaxV3ScriptSrc =
      config.get<string>('mathjaxV3ScriptSrc') ??
      defaultConfig.mathjaxV3ScriptSrc;
    this.codeBlockTheme =
      config.get<CodeBlockTheme>('codeBlockTheme') ??
      defaultConfig.codeBlockTheme;
    this.previewTheme =
      config.get<PreviewTheme>('previewTheme') ?? defaultConfig.previewTheme;
    this.revealjsTheme =
      config.get<RevealJsTheme>('revealjsTheme') ?? defaultConfig.revealjsTheme;
    this.protocolsWhiteList =
      config.get<string>('protocolsWhiteList') ??
      defaultConfig.protocolsWhiteList;
    this.imageFolderPath =
      config.get<string>('imageFolderPath') ?? defaultConfig.imageFolderPath;
    this.imageUploader = config.get<string>('imageUploader') ?? 'imgur';
    this.printBackground =
      config.get<boolean>('printBackground') ?? defaultConfig.printBackground;
    this.chromePath =
      config.get<string>('chromePath') ?? defaultConfig.chromePath;
    this.imageMagickPath =
      config.get<string>('imageMagickPath') ?? defaultConfig.imageMagickPath;
    this.pandocPath =
      config.get<string>('pandocPath') ?? defaultConfig.pandocPath;
    this.pandocMarkdownFlavor =
      config.get<string>('pandocMarkdownFlavor') ??
      defaultConfig.pandocMarkdownFlavor;
    this.pandocArguments =
      config.get<string[]>('pandocArguments') ?? defaultConfig.pandocArguments;
    this.latexEngine =
      config.get<string>('latexEngine') ?? defaultConfig.latexEngine;
    this.enableScriptExecution =
      config.get<boolean>('enableScriptExecution') ??
      defaultConfig.enableScriptExecution;

    this.scrollSync = config.get<boolean>('scrollSync') ?? true;
    this.liveUpdate = config.get<boolean>('liveUpdate') ?? true;
    this.singlePreview = config.get<boolean>('singlePreview') ?? true;
    this.automaticallyShowPreviewOfMarkdownBeingEdited =
      config.get<boolean>('automaticallyShowPreviewOfMarkdownBeingEdited') ??
      false;
    this.previewColorScheme =
      config.get<PreviewColorScheme>('previewColorScheme') ??
      PreviewColorScheme.selectedPreviewTheme;
    this.enableHTML5Embed =
      config.get<boolean>('enableHTML5Embed') ?? defaultConfig.enableHTML5Embed;
    this.HTML5EmbedUseImageSyntax =
      config.get<boolean>('HTML5EmbedUseImageSyntax') ??
      defaultConfig.HTML5EmbedUseImageSyntax;
    this.HTML5EmbedUseLinkSyntax =
      config.get<boolean>('HTML5EmbedUseLinkSyntax') ??
      defaultConfig.HTML5EmbedUseLinkSyntax;
    this.HTML5EmbedIsAllowedHttp =
      config.get<boolean>('HTML5EmbedIsAllowedHttp') ??
      defaultConfig.HTML5EmbedIsAllowedHttp;
    this.HTML5EmbedAudioAttributes =
      config.get<string>('HTML5EmbedAudioAttributes') ??
      defaultConfig.HTML5EmbedAudioAttributes;
    this.HTML5EmbedVideoAttributes =
      config.get<string>('HTML5EmbedVideoAttributes') ??
      defaultConfig.HTML5EmbedVideoAttributes;
    this.puppeteerWaitForTimeout =
      config.get<number>('puppeteerWaitForTimeout') ??
      defaultConfig.puppeteerWaitForTimeout;
    this.puppeteerArgs =
      config.get<string[]>('puppeteerArgs') ?? defaultConfig.puppeteerArgs;
    this.plantumlJarPath =
      config.get<string>('plantumlJarPath') ?? defaultConfig.plantumlJarPath;
    this.plantumlServer =
      config.get<string>('plantumlServer') ?? defaultConfig.plantumlServer;
    this.hideDefaultVSCodeMarkdownPreviewButtons =
      config.get<boolean>('hideDefaultVSCodeMarkdownPreviewButtons') ?? true;
    this.jsdelivrCdnHost =
      config.get<string>('jsdelivrCdnHost') ?? defaultConfig.jsdelivrCdnHost;
    this.krokiServer =
      config.get<string>('krokiServer') ?? defaultConfig.krokiServer;
  }
  globalCss: string;
  mermaidConfig;
  mathjaxConfig;
  katexConfig;
  parserConfig: ParserConfig;
  isVSCode: boolean;

  public isEqualTo(otherConfig: MarkdownPreviewEnhancedConfig) {
    const json1 = JSON.stringify(this);
    const json2 = JSON.stringify(otherConfig);
    return json1 === json2;
  }

  [key: string]: any;
}
