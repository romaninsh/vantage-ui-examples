# action/

One YAML file per named side-effecting operation invokable from a
row action's Rhai body. Filename (without `.yaml`) becomes the
catalog key; the Rhai function name is the same key with `-`
converted to `_`. So `action/send-password-reset.yaml` is reachable
in row-action Rhai as:

```rhai
actions.send_password_reset(row.email, row.name, generate_password(12));
```

## Schema

The current schema is `action-schema-1.json`. New YAML files should
opt into editor validation by starting with:

```yaml
# yaml-language-server: $schema=./action-schema-1.json
```

## Required fields

- `kind:` — executor discriminator. v1: `http_request`.
- `params:` — positional parameter declarations. **Declaration order
  is the public contract** — the Rhai host fn takes arguments in this
  exact order.

## Optional fields

- `description:` — rendered in the confirmation dialog body.
- `http:` — required when `kind: http_request`. URL + headers support
  `${ENV_VAR}` substitution from the process environment; body values
  are Rhai expressions evaluated with the resolved param map in scope.

## Example

```yaml
# yaml-language-server: $schema=./action-schema-1.json
kind: http_request
description: Email a fresh password to the customer.
params:
  email: { type: string, label: Email }
  name: { type: string }
  password: { type: string, label: "New password" }
http:
  method: POST
  url: "${MAILER_URL}/password-reset"
  headers:
    Authorization: "Bearer ${MAILER_TOKEN}"
    Content-Type: "application/json"
  body:
    email: email
    name: name
    password: password
```
