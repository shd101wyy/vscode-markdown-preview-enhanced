import {
  CodeBlockTheme,
  MarkdownEngineConfig,
  MathRenderingOption,
  MermaidTheme,
  PreviewTheme,
  RevealJsTheme,
  utility,
} from '@shd101wyy/mume';
import * as vscode from 'vscode';
import { PathResolver } from './utils/path-resolver.js';

export enum PreviewColorScheme {
  selectedPreviewTheme = 'selectedPreviewTheme',
  systemColorScheme = 'systemColorScheme',
  editorColorScheme = 'editorColorScheme',
}

export class MarkdownPreviewEnhancedConfig implements MarkdownEngineConfig {
  public static getCurrentConfig() {
    return new MarkdownPreviewEnhancedConfig();
  }

  public readonly configPath: string;
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
  public readonly frontMatterRenderingOption: string;
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

    this.configPath = (
      config.get<string>('configPath') || utility.getConfigPath()
    ).trim();
    this.configPath = PathResolver.resolvePath(this.configPath);

    this.usePandocParser = config.get<boolean>('usePandocParser');
    this.breakOnSingleNewLine = config.get<boolean>('breakOnSingleNewLine');
    this.enableTypographer = config.get<boolean>('enableTypographer');
    this.enableWikiLinkSyntax = config.get<boolean>('enableWikiLinkSyntax');
    this.enableLinkify = config.get<boolean>('enableLinkify');
    this.useGitHubStylePipedLink = config.get<boolean>(
      'useGitHubStylePipedLink',
    );
    this.wikiLinkFileExtension = config.get<string>('wikiLinkFileExtension');
    this.enableEmojiSyntax = config.get<boolean>('enableEmojiSyntax');
    this.enableExtendedTableSyntax = config.get<boolean>(
      'enableExtendedTableSyntax',
    );
    this.enableCriticMarkupSyntax = config.get<boolean>(
      'enableCriticMarkupSyntax',
    );
    this.frontMatterRenderingOption = config.get<string>(
      'frontMatterRenderingOption',
    );
    this.mermaidTheme = config.get<MermaidTheme>('mermaidTheme');
    this.mathRenderingOption = config.get<string>(
      'mathRenderingOption',
    ) as MathRenderingOption;
    this.mathInlineDelimiters = config.get<string[][]>('mathInlineDelimiters');
    this.mathBlockDelimiters = config.get<string[][]>('mathBlockDelimiters');
    this.mathRenderingOnlineService = config.get<string>(
      'mathRenderingOnlineService',
    );
    this.mathjaxV3ScriptSrc = config.get<string>('mathjaxV3ScriptSrc');
    this.codeBlockTheme = config.get<CodeBlockTheme>('codeBlockTheme');
    this.previewTheme = config.get<PreviewTheme>('previewTheme');
    this.revealjsTheme = config.get<RevealJsTheme>('revealjsTheme');
    this.protocolsWhiteList = config.get<string>('protocolsWhiteList');
    this.imageFolderPath = config.get<string>('imageFolderPath');
    this.imageUploader = config.get<string>('imageUploader');
    this.printBackground = config.get<boolean>('printBackground');
    this.chromePath = config.get<string>('chromePath');
    this.imageMagickPath = config.get<string>('imageMagickPath');
    this.pandocPath = config.get<string>('pandocPath');
    this.pandocMarkdownFlavor = config.get<string>('pandocMarkdownFlavor');
    this.pandocArguments = config.get<string[]>('pandocArguments');
    this.latexEngine = config.get<string>('latexEngine');
    this.enableScriptExecution = config.get<boolean>('enableScriptExecution');

    this.scrollSync = config.get<boolean>('scrollSync');
    this.liveUpdate = config.get<boolean>('liveUpdate');
    this.singlePreview = config.get<boolean>('singlePreview');
    this.automaticallyShowPreviewOfMarkdownBeingEdited = config.get<boolean>(
      'automaticallyShowPreviewOfMarkdownBeingEdited',
    );
    this.previewColorScheme = config.get<PreviewColorScheme>(
      'previewColorScheme',
    );

    this.enableHTML5Embed = config.get<boolean>('enableHTML5Embed');
    this.HTML5EmbedUseImageSyntax = config.get<boolean>(
      'HTML5EmbedUseImageSyntax',
    );
    this.HTML5EmbedUseLinkSyntax = config.get<boolean>(
      'HTML5EmbedUseLinkSyntax',
    );
    this.HTML5EmbedIsAllowedHttp = config.get<boolean>(
      'HTML5EmbedIsAllowedHttp',
    );
    this.HTML5EmbedAudioAttributes = config.get<string>(
      'HTML5EmbedAudioAttributes',
    );
    this.HTML5EmbedVideoAttributes = config.get<string>(
      'HTML5EmbedVideoAttributes',
    );
    this.puppeteerWaitForTimeout = config.get<number>(
      'puppeteerWaitForTimeout',
    );
    this.puppeteerArgs = config.get<string[]>('puppeteerArgs');
    this.plantumlJarPath = config.get<string>('plantumlJarPath');
    this.plantumlServer = config.get<string>('plantumlServer');
    this.hideDefaultVSCodeMarkdownPreviewButtons = config.get<boolean>(
      'hideDefaultVSCodeMarkdownPreviewButtons',
    );
    this.jsdelivrCdnHost = config.get<string>('jsdelivrCdnHost');
    this.krokiServer = config.get<string>('krokiServer');
  }

  public isEqualTo(otherConfig: MarkdownPreviewEnhancedConfig) {
    const json1 = JSON.stringify(this);
    const json2 = JSON.stringify(otherConfig);
    return json1 === json2;
  }

  [key: string]: any;
}
