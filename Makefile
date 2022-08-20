all:
	pnpm build
	mkdir -p ~/development/callistonianembrace/ligolang/registry/plugins
	rm -rf ~/development/callistonianembrace/ligolang/registry/plugins/verdaccio-ligo-registry-download-metrics
	cp -R . ~/development/callistonianembrace/ligolang/registry/plugins/verdaccio-ligo-registry-download-metrics
