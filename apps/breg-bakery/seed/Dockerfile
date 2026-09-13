# The data-tools image: python plus the surreal CLI the generators
# shell out to. The scripts themselves (seed.py, promotion.py) are
# mounted at run time (see composer.yaml), so editing a generator
# never needs a rebuild — and one image serves them all:
#   docker compose run --rm seed seed.py m --wipe
#   docker compose run --rm seed promotion.py --interactive …
FROM surrealdb/surrealdb:latest AS surreal

FROM python:3.12-slim
COPY --from=surreal /surreal /usr/local/bin/surreal
WORKDIR /app
ENTRYPOINT ["python3"]
