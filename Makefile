PORT     ?= 8080
CS_USER  ?= $(USER)
PROJECT  ?= $(notdir $(CURDIR))
RUNTIME  := .runtime
PIDFILE  := $(RUNTIME)/server.pid

.PHONY: help up down status test deploy

help: ## Show this help
	@echo "Available commands:"
	@echo
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'
	@echo
	@echo "  Variables: PORT=$(PORT) CS_USER=$(CS_USER) PROJECT=$(PROJECT)"

up: ## Start the local dev server (PHP, or Python as fallback)
	@mkdir -p $(RUNTIME)
	@if [ -f $(PIDFILE) ] && kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then \
		echo "Already running: http://127.0.0.1:$(PORT)/"; exit 0; \
	fi; \
	if command -v php >/dev/null; then \
		php -S 127.0.0.1:$(PORT) -t . router.php > $(RUNTIME)/server.log 2>&1 & echo $$! > $(PIDFILE); \
	elif command -v python3 >/dev/null; then \
		echo "php not found, using python3 http.server (does not block private files)"; \
		python3 -m http.server $(PORT) --bind 127.0.0.1 > $(RUNTIME)/server.log 2>&1 & echo $$! > $(PIDFILE); \
	else \
		echo "PHP or Python 3 is required to run the local server."; exit 1; \
	fi; \
	sleep 1; \
	if kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then \
		echo "Site running: http://127.0.0.1:$(PORT)/"; echo "Run 'make down' to stop."; \
	else \
		echo "Server failed to start, see $(RUNTIME)/server.log"; rm -f $(PIDFILE); exit 1; \
	fi

down: ## Stop the local dev server
	@if [ -f $(PIDFILE) ] && kill $$(cat $(PIDFILE)) 2>/dev/null; then echo "Stopped."; else echo "Not running."; fi
	@rm -f $(PIDFILE)

status: ## Show whether the local server is running
	@if [ -f $(PIDFILE) ] && kill -0 $$(cat $(PIDFILE)) 2>/dev/null; then echo "Running: http://127.0.0.1:$(PORT)/"; else echo "Not running."; fi

test: ## Syntax-check the JavaScript (and PHP if available)
	@command -v node >/dev/null && node --check assets/app.js && node --check assets/data.js && echo "JS ok" || echo "node not found, skipping JS check"
	@command -v php >/dev/null && php -l router.php || echo "php not found, skipping PHP check"

deploy: ## Copy the site to ~/public_html/$(PROJECT)/ on itchy.cs.umu.se
	rsync -av --delete \
		--exclude .git --exclude $(RUNTIME) --exclude guidelines --exclude '*.docx' \
		./ $(CS_USER)@itchy.cs.umu.se:public_html/$(PROJECT)/
	@echo "Live at https://people.cs.umu.se/$(CS_USER)/$(PROJECT)/"
