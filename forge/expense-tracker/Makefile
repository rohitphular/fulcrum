.PHONY: app-start app-stop api-deploy api-logs help

help:
	@echo ""
	@echo "  app-start    Start local HTTP server → http://localhost:8000"
	@echo "  app-stop     Stop the local HTTP server"
	@echo "  api-deploy   Deploy GAS backend (interactive: pick env)"
	@echo "  api-logs     Open GAS executions page in browser (interactive: pick env)"
	@echo ""

app-start:
	@if [ -f .server.pid ] && kill -0 $$(cat .server.pid) 2>/dev/null; then \
		echo "Server already running (PID $$(cat .server.pid)) → http://localhost:8000"; \
	else \
		python3 -m http.server 8000 --directory app > /dev/null 2>&1 & echo $$! > .server.pid; \
		echo "Server started (PID $$(cat .server.pid)) → http://localhost:8000"; \
	fi

app-stop:
	@if [ -f .server.pid ] && kill -0 $$(cat .server.pid) 2>/dev/null; then \
		kill $$(cat .server.pid) && rm -f .server.pid; \
		echo "Server stopped."; \
	else \
		rm -f .server.pid; \
		echo "Server is not running."; \
	fi

api-deploy:
	bash cicd/deploy.sh

api-logs:
	bash cicd/logs.sh
