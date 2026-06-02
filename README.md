exit

docker run -it \
  --user root \
  -v $(pwd):/workspaces/itau-ft5-doc-squad-tron \
  localhost/doc-squad-tron:latest bash
