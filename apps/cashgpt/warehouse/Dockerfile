# The cashgpt warehouse as one image: postgres 17 plus the catalogue,
# generators and usage simulator that fill it. The first start of an
# empty data volume runs init.sh inside postgres's init phase (see the
# comments there for timing); every later start is a plain postgres start.
FROM postgres:17-alpine

RUN apk add --no-cache nodejs npm

WORKDIR /warehouse
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY schema ./schema
COPY scripts ./scripts
COPY init.sh /docker-entrypoint-initdb.d/10-warehouse.sh
# The init phase runs as `postgres`; the generators write data/ here.
RUN mkdir data && chown -R postgres:postgres /warehouse
