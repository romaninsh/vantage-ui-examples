# The seeder image: python for seed.py plus the surreal CLI it shells
# out to. seed.py itself is mounted at run time (see composer.yaml),
# so editing the generator never needs a rebuild.
FROM surrealdb/surrealdb:latest AS surreal

FROM python:3.12-slim
COPY --from=surreal /surreal /usr/local/bin/surreal
WORKDIR /app
ENTRYPOINT ["python3", "seed.py"]
