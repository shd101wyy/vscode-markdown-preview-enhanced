{
  pkgs ? import <nixpkgs> { },
  unstablePkgs ? import <nixpkgs> { },
}:
let
  # The rolling <nixpkgs> channel no longer packages Node 18 (EOL upstream),
  # so pull it from the last release line that still does. Node 18 is the
  # runtime of the VS Code extension host the bundled code must load on (no
  # global File, etc.) — the same pin as crossnote's shell.nix. Keep
  # .tool-versions (used by CI) on the same major version.
  node18 = import
    (builtins.fetchTarball {
      url = "https://github.com/NixOS/nixpkgs/archive/nixos-24.11.tar.gz";
      sha256 = "1s2gr5rcyqvpr58vxdcb095mdhblij9bfzaximrva2243aal3dgx";
    })
    {
      # builtins.currentSystem is unavailable under pure eval, so derive
      # this host's platform from the pkgs passed in by flake.nix (or the
      # impure <nixpkgs> import of a classic nix-shell).
      system = pkgs.system;
    };
in
with pkgs;
mkShell {
  buildInputs = [
    node18.nodejs_18
    pnpm
    bash
    vsce
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
