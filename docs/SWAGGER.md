# PlantHub Swagger API testing

## Local access

Start the backend as usual, then open:

- `http://localhost:3000/api-docs/`
- `http://localhost:3000/api-docs/openapi.json`

Swagger UI lists all REST endpoint declarations from the Express route files. It supports search, request parameters, JSON request bodies, file upload and execution from the browser. The route inventory updates on backend restart after new routes are added. It does not change route handlers or bypass existing authorization/validation. Some less-common operations use a generic JSON schema; consult `src/validators/` for the exact accepted parameters.

## Testing endpoints with JWT

1. Expand `POST /api/v1/auth/login`, use **Try it out** and **Execute** with a test account.
2. Copy the `token` from the response and click **Authorize** in Swagger.
3. Paste the token into the Bearer authentication dialog. You can now test protected routes.
4. Admin APIs require a token from `POST /api/v1/admin/login` with appropriate admin permissions, not a normal user account.

**Caution:** Swagger makes real API requests. Creating, editing and deleting data from Swagger affects whichever database your backend is connected to. Do not test destructive actions on production data.

## Production / Render

The Render blueprint enables `SWAGGER_ENABLED=true` and sets `SWAGGER_USERNAME=swagger`; `SWAGGER_PASSWORD` is generated and stored as a separate service secret. Open `https://YOUR-BACKEND-HOST/api-docs/` and enter those Basic Auth credentials before using Swagger. If Render does not apply changes from `render.yaml` to an existing service, manually configure the same variables in the Render service environment settings, then redeploy.

Swagger defaults to disabled in production unless explicitly enabled. It will not be served in production if `SWAGGER_USERNAME` or a password with at least 12 characters is missing. In local development, Swagger is enabled by default and can be disabled with `SWAGGER_ENABLED=false`. You can also set username/password locally to require Basic authentication.

HTTP Basic protects the documentation page and the JSON specification. API endpoints retain their own Bearer JWT authentication; Basic authorization for Swagger is not sufficient to call protected APIs.

## Verify

Run:

```powershell
node --test tests/swagger.node-test.js tests/swagger-production.node-test.js
```
