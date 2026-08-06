.PHONY: app-start app-stop api-deploy api-logs job-start job-setup help

help:
	@echo ""
	@echo "  app-start    Start local HTTP server → http://localhost:8000/expense-tracker/app/"
	@echo "  app-stop     Stop the local HTTP server"
	@echo "  api-deploy   Deploy GAS backend (interactive: pick env)"
	@echo "  api-logs     Open GAS executions page in browser (interactive: pick env)"
	@echo "  job-start    Run all jobs (ENV=dev|prod, JOB=name optional)"
	@echo "  job-setup    Create venv and install job dependencies"
	@echo ""

app-start:
	@if [ -f .server.pid ] && kill -0 $$(cat .server.pid) 2>/dev/null; then \
		echo "Server already running (PID $$(cat .server.pid)) → http://localhost:8000/expense-tracker/app/"; \
	elif lsof -ti :8000 > /dev/null 2>&1; then \
		OTHER_PID=$$(lsof -ti :8000 | head -1); \
		echo "Port 8000 is in use by PID $$OTHER_PID."; \
		echo "  1) Kill it and start the server"; \
		echo "  2) Exit — I'll handle it myself"; \
		@echo "" \
		printf "#? "; read -r CHOICE; \
		if [ "$$CHOICE" = "1" ]; then \
			kill $$OTHER_PID && rm -f .server.pid; \
			python3 -m http.server 8000 --directory .. > /dev/null 2>&1 & echo $$! > .server.pid; \
			echo "Server started (PID $$(cat .server.pid)) → http://localhost:8000/expense-tracker/app/"; \
		else \
			echo "Run: kill $$OTHER_PID — then re-run make app-start."; \
			exit 1; \
		fi; \
	else \
		python3 -m http.server 8000 --directory .. > /dev/null 2>&1 & echo $$! > .server.pid; \
		echo "Server started (PID $$(cat .server.pid)) → http://localhost:8000/expense-tracker/app/"; \
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

job-setup:
	python3 -m venv job/.venv
	job/.venv/bin/pip install -r job/requirements.txt
	@echo "Setup done. venv is at job/.venv"

job-start:
	@echo ""; \
	echo "  1) dev"; \
	echo "  2) prod"; \
	echo ""; \
	printf "Select environment: "; read -r CHOICE; \
	if [ "$$CHOICE" = "1" ]; then ENV="dev"; \
	elif [ "$$CHOICE" = "2" ]; then ENV="prod"; \
	else echo "Invalid choice '$$CHOICE'. Enter 1 or 2."; exit 1; \
	fi; \
	JOB_ARG=$${JOB:+--job $$JOB}; \
	job/.venv/bin/python job/runner.py --env $$ENV $$JOB_ARG
