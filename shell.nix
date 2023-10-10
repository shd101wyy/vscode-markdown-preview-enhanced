{ pkgs ? import <nixpkgs> { } }:
with pkgs;
mkShell {
  buildInputs = [ nodejs_18 yarn ];
  shellHook = ''
    # ...
  '';
}

