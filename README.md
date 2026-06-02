cd /home/jccbzlf/development/ft5/plataforma/docs/test/itau-ft5-doc-squad-tron

podman build -f .devcontainer/Dockerfile -t doc-squad-tron .

podman run -it \
  -v $(pwd):/workspaces/itau-ft5-doc-squad-tron \
  doc-squad-tron bash
