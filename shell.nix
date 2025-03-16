{
  pkgs ? import <nixpkgs> { },
  unstablePkgs ? import <nixpkgs> { },
}:
with pkgs;
mkShell {
  buildInputs = [
    nodejs_20
    yarn
  ];
  nativeBuildInputs = [
    unstablePkgs.playwright.browsers # 1.50.1
    # NOTE: ^ The version needs to match the version of playwright in @vscode/test-web
  ];
  shellHook = ''
    # ...
    export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
    export PLAYWRIGHT_BROWSERS_PATH=${unstablePkgs.playwright.browsers}
    export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
  '';
}
