import {
  CodeBlockTheme,
  FrontMatterRenderingOption,
  ImageUploader,
  KatexOptions,
  MathRenderingOption,
  MermaidConfig,
  MermaidTheme,
  NotebookConfig,
  ParserConfig,
  PreviewMode,
  PreviewTheme,
  RevealJsTheme,
  WikiLinkTargetFileNameChangeCase,
  getDefaultNotebookConfig,
} from 'crossnote';
import { JsonObject } from 'type-fest';
import * as vscode from 'vscode';
import { isVSCodeWebExtension } from './utils';

export enum PreviewColorScheme {
  selectedPreviewTheme = 'selectedPreviewTheme',
  systemColorScheme = 'systemColorScheme',
  editorColorScheme = 'editorColorScheme',
}

type VSCodeMPEConfigKey =
  | 'automaticallyShowPreviewOfMarkdownBeingEdited'
  | 'configPath'
  | 'imageUploader'
  | 'hideDefaultVSCodeMarkdownPreviewButtons'
  | 'liveUpdate'
  | 'previewColorScheme'
  | 'previewMode'
  | 'qiniuAccessKey'
  | 'qiniuBucket'
  | 'qiniuDomain'
  | 'qiniuSecretKey'
  | 'scrollSync'
  | 'disableAutoPreviewForUriSchemes';

type ConfigKey = keyof NotebookConfig | VSCodeMPEConfigKey;

export class MarkdownPreviewEnhancedConfig implements NotebookConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig();
  }

  public readonly markdownFileExtensions: string[];
  public readonly configPath: string;
  public readonly usePandocParser: boolean;
  public readonly breakOnSingleNewLine: boolean;
  public readonly enableTypographer: boolean;
  public readonly enableWikiLinkSyntax: boolean;
  public readonly enableLinkify: boolean;
  public readonly useGitHubStylePipedLink: boolean;
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
  public readonly jsdelivrCdnHost: string;
  public readonly krokiServer: string;
  public readonly alwaysShowBacklinksInPreview: boolean;
  public readonly enablePreviewZenMode: boolean;
  public readonly wikiLinkTargetFileExtension: string;
  public readonly wikiLinkTargetFileNameChangeCase: WikiLinkTargetFileNameChangeCase;
  // Don't set values for these properties in constructor:
  public readonly includeInHeader: string;
  public readonly globalCss: string;
  public readonly mermaidConfig: MermaidConfig;
  public readonly mathjaxConfig: JsonObject;
  public readonly katexConfig: KatexOptions;
  public readonly parserConfig: ParserConfig;
  public readonly isVSCode: boolean = true;

  // preview config
  public readonly automaticallyShowPreviewOfMarkdownBeingEdited: boolean;
  public readonly hideDefaultVSCodeMarkdownPreviewButtons: boolean;
  public readonly imageUploader: ImageUploader;
  public readonly liveUpdate: boolean;
  public readonly previewColorScheme: PreviewColorScheme;
  public readonly previewMode: PreviewMode;
  public readonly scrollSync: boolean;

  private constructor() {
    const defaultConfig = getDefaultNotebookConfig();

    this.markdownFileExtensions =
      getMPEConfig<string[]>('markdownFileExtensions') ??
      defaultConfig.markdownFileExtensions;
    this.configPath = getMPEConfig<string>('configPath') ?? '';
    this.usePandocParser = isVSCodeWebExtension()
      ? false // pandoc is not supported in web extension
      : getMPEConfig<boolean>('usePandocParser') ??
        defaultConfig.usePandocParser;
    this.breakOnSingleNewLine =
      getMPEConfig<boolean>('breakOnSingleNewLine') ??
      defaultConfig.breakOnSingleNewLine;
    this.enableTypographer =
      getMPEConfig<boolean>('enableTypographer') ??
      defaultConfig.enableTypographer;
    this.enableWikiLinkSyntax =
      getMPEConfig<boolean>('enableWikiLinkSyntax') ??
      defaultConfig.enableWikiLinkSyntax;
    this.enableLinkify =
      getMPEConfig<boolean>('enableLinkify') ?? defaultConfig.enableLinkify;
    this.useGitHubStylePipedLink =
      getMPEConfig<boolean>('useGitHubStylePipedLink') ??
      defaultConfig.useGitHubStylePipedLink;
    this.enableEmojiSyntax =
      getMPEConfig<boolean>('enableEmojiSyntax') ??
      defaultConfig.enableEmojiSyntax;
    this.enableExtendedTableSyntax =
      getMPEConfig<boolean>('enableExtendedTableSyntax') ??
      defaultConfig.enableExtendedTableSyntax;
    this.enableCriticMarkupSyntax =
      getMPEConfig<boolean>('enableCriticMarkupSyntax') ??
      defaultConfig.enableCriticMarkupSyntax;
    this.frontMatterRenderingOption =
      getMPEConfig<FrontMatterRenderingOption>('frontMatterRenderingOption') ??
      defaultConfig.frontMatterRenderingOption;
    this.mermaidTheme =
      getMPEConfig<MermaidTheme>('mermaidTheme') ?? defaultConfig.mermaidTheme;
    this.mathRenderingOption =
      (getMPEConfig<string>('mathRenderingOption') as MathRenderingOption) ??
      defaultConfig.mathRenderingOption;
    this.mathInlineDelimiters =
      getMPEConfig<string[][]>('mathInlineDelimiters') ??
      defaultConfig.mathInlineDelimiters;
    this.mathBlockDelimiters =
      getMPEConfig<string[][]>('mathBlockDelimiters') ??
      defaultConfig.mathBlockDelimiters;
    this.mathRenderingOnlineService =
      getMPEConfig<string>('mathRenderingOnlineService') ??
      defaultConfig.mathRenderingOnlineService;
    this.mathjaxV3ScriptSrc =
      getMPEConfig<string>('mathjaxV3ScriptSrc') ??
      defaultConfig.mathjaxV3ScriptSrc;
    this.codeBlockTheme =
      getMPEConfig<CodeBlockTheme>('codeBlockTheme') ??
      defaultConfig.codeBlockTheme;
    this.previewTheme =
      getMPEConfig<PreviewTheme>('previewTheme') ?? defaultConfig.previewTheme;
    this.revealjsTheme =
      getMPEConfig<RevealJsTheme>('revealjsTheme') ??
      defaultConfig.revealjsTheme;
    this.protocolsWhiteList =
      getMPEConfig<string>('protocolsWhiteList') ??
      defaultConfig.protocolsWhiteList;
    this.imageFolderPath =
      getMPEConfig<string>('imageFolderPath') ?? defaultConfig.imageFolderPath;
    this.imageUploader =
      getMPEConfig<ImageUploader>('imageUploader') ?? 'imgur';
    this.printBackground =
      getMPEConfig<boolean>('printBackground') ?? defaultConfig.printBackground;
    this.chromePath =
      getMPEConfig<string>('chromePath') ?? defaultConfig.chromePath;
    this.imageMagickPath =
      getMPEConfig<string>('imageMagickPath') ?? defaultConfig.imageMagickPath;
    this.pandocPath =
      getMPEConfig<string>('pandocPath') ?? defaultConfig.pandocPath;
    this.pandocMarkdownFlavor =
      getMPEConfig<string>('pandocMarkdownFlavor') ??
      defaultConfig.pandocMarkdownFlavor;
    this.pandocArguments =
      getMPEConfig<string[]>('pandocArguments') ??
      defaultConfig.pandocArguments;
    this.latexEngine =
      getMPEConfig<string>('latexEngine') ?? defaultConfig.latexEngine;
    this.enableScriptExecution =
      getMPEConfig<boolean>('enableScriptExecution') ??
      defaultConfig.enableScriptExecution;

    this.scrollSync = getMPEConfig<boolean>('scrollSync') ?? true;
    this.liveUpdate = getMPEConfig<boolean>('liveUpdate') ?? true;
    this.previewMode =
      getMPEConfig<PreviewMode>('previewMode') ?? PreviewMode.SinglePreview;
    this.automaticallyShowPreviewOfMarkdownBeingEdited =
      getMPEConfig<boolean>('automaticallyShowPreviewOfMarkdownBeingEdited') ??
      false;
    this.previewColorScheme =
      getMPEConfig<PreviewColorScheme>('previewColorScheme') ??
      PreviewColorScheme.selectedPreviewTheme;
    this.enableHTML5Embed =
      getMPEConfig<boolean>('enableHTML5Embed') ??
      defaultConfig.enableHTML5Embed;
    this.HTML5EmbedUseImageSyntax =
      getMPEConfig<boolean>('HTML5EmbedUseImageSyntax') ??
      defaultConfig.HTML5EmbedUseImageSyntax;
    this.HTML5EmbedUseLinkSyntax =
      getMPEConfig<boolean>('HTML5EmbedUseLinkSyntax') ??
      defaultConfig.HTML5EmbedUseLinkSyntax;
    this.HTML5EmbedIsAllowedHttp =
      getMPEConfig<boolean>('HTML5EmbedIsAllowedHttp') ??
      defaultConfig.HTML5EmbedIsAllowedHttp;
    this.HTML5EmbedAudioAttributes =
      getMPEConfig<string>('HTML5EmbedAudioAttributes') ??
      defaultConfig.HTML5EmbedAudioAttributes;
    this.HTML5EmbedVideoAttributes =
      getMPEConfig<string>('HTML5EmbedVideoAttributes') ??
      defaultConfig.HTML5EmbedVideoAttributes;
    this.puppeteerWaitForTimeout =
      getMPEConfig<number>('puppeteerWaitForTimeout') ??
      defaultConfig.puppeteerWaitForTimeout;
    this.puppeteerArgs =
      getMPEConfig<string[]>('puppeteerArgs') ?? defaultConfig.puppeteerArgs;
    this.plantumlJarPath =
      getMPEConfig<string>('plantumlJarPath') ?? defaultConfig.plantumlJarPath;
    this.plantumlServer =
      getMPEConfig<string>('plantumlServer') ?? defaultConfig.plantumlServer;
    if (!this.plantumlServer && isVSCodeWebExtension()) {
      this.plantumlServer = 'https://kroki.io/plantuml/svg/';
    }
    this.hideDefaultVSCodeMarkdownPreviewButtons =
      getMPEConfig<boolean>('hideDefaultVSCodeMarkdownPreviewButtons') ?? true;
    this.jsdelivrCdnHost =
      getMPEConfig<string>('jsdelivrCdnHost') ?? defaultConfig.jsdelivrCdnHost;
    this.krokiServer =
      getMPEConfig<string>('krokiServer') ?? defaultConfig.krokiServer;
    this.alwaysShowBacklinksInPreview =
      getMPEConfig<boolean>('alwaysShowBacklinksInPreview') ??
      defaultConfig.alwaysShowBacklinksInPreview;
    this.enablePreviewZenMode =
      getMPEConfig<boolean>('enablePreviewZenMode') ??
      defaultConfig.enablePreviewZenMode;
    this.wikiLinkTargetFileExtension =
      getMPEConfig<string>('wikiLinkTargetFileExtension') ??
      defaultConfig.wikiLinkTargetFileExtension;
    this.wikiLinkTargetFileNameChangeCase =
      getMPEConfig<WikiLinkTargetFileNameChangeCase>(
        'wikiLinkTargetFileNameChangeCase',
      ) ?? defaultConfig.wikiLinkTargetFileNameChangeCase;
  }

  public isEqualTo(otherConfig: MarkdownPreviewEnhancedConfig) {
    const json1 = JSON.stringify(this);
    const json2 = JSON.stringify(otherConfig);
    return json1 === json2;
  }

  [key: string]: any;
}

export function getMPEConfig<T>(section: ConfigKey) {
  const config = vscode.workspace.getConfiguration('markdown-preview-enhanced');
  return config.get<T>(section);
}

export function updateMPEConfig<T>(
  section: ConfigKey,
  value: T,
  configurationTarget?: boolean | vscode.ConfigurationTarget | null | undefined,
  overrideInLanguage?: boolean | undefined,
) {
  const config = vscode.workspace.getConfiguration('markdown-preview-enhanced');
  return config.update(section, value, configurationTarget, overrideInLanguage);
}
