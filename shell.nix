{ pkgs ? import <nixpkgs> { } }:
with pkgs;
mkShell {
  buildInputs = [ nodejs_20 yarn ];
  shellHook = ''
    # ...
  '';
}

