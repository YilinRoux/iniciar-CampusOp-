{
  "schemaVersion": 1,
  "week": 3,
  "teamId": "Equipo10",
  "members": [
    {
      "studentId": "3523110152 - Olmos Antonio Diana Laura",
      "commitShas": ["6a04dd4270259aa535036ce63ce67a63090f0dc1"],
      "files": [
        "docs/threat-model.md",
        "reports/week-03/security.json",
        "evidence/week-03/engineering.json",
        ".github/workflows/week-03-ci-amenazas-feedback.yml"
      ],
      "tests": ["make public-test-week-03", "npm run backend:self-test"],
      "reviews": [],
      "prediction": "Esperaba que al agregar '|| true' al paso de bundle:release en el workflow, el check workflow_integrity del evaluador y la prueba publica de week-03 detectaran el bypass y fallaran, y que al revertirlo, git diff no mostrara ninguna diferencia contra el estado original.",
      "command": "make public-test-week-03",
      "observedResult": "Con el bypass activo, el comando termino con status fail: workflow_integrity reporto bypass markers=['|| true'], y la prueba course-tests/public/week-03.test.ts fallo mostrando el mismo patron. Tras revertir el cambio, git diff del workflow no mostro ninguna diferencia, confirmando que quedo igual al original.",
      "explanation": "Esto confirma que el proceso de CI no permite ocultar un fallo obligatorio agregando un bypass como '|| true': tanto el evaluador Python como la prueba publica de Jest lo detectan de forma independiente, cumpliendo lo que exige AC-03 sobre demostrar que un incumplimiento no se oculta."
    },
    {
      "studentId": "3523110441 - Moreno Vasquez Abraham",
      "commitShas": ["84c250dd9b560f2d8360e2a2806f725cff8d009e"],
      "files": ["course-tests/security/assign-authorization.test.mjs"],
      "tests": ["node course-tests/security/assign-authorization.test.mjs"],
      "reviews": [],
      "prediction": "Esperaba que el backend rechazara con 403 el intento de un actor con rol technician de ejecutar la accion assign, ya que en course-backend/campusops.mjs 'assign' esta dentro de coordinatorActions y el codigo verifica explicitamente role !== 'coordinator' antes de permitirla.",
      "command": "node course-tests/security/assign-authorization.test.mjs",
      "observedResult": "El script imprimio: 'OK: un tecnico sin rol de coordinador no puede ejecutar la accion assign (403 confirmado).', sin ningun error de assert, confirmando que la respuesta del backend fue 403 forbidden.",
      "explanation": "Esto confirma en codigo real el control documentado en docs/threat-model.md para la amenaza 'alterar asignaciones sin autorizacion': solo un actor con rol coordinator puede ejecutar la accion assign sobre una incidencia, tal como esta implementado en la validacion coordinatorActions.includes(action) && role !== 'coordinator' de course-backend/campusops.mjs."
    },
    {
      "studentId": "3522110243 - Olivera Perez Josmar",
      "commitShas": ["SE_LLENA_DESPUES_DE_COMMITEAR"],
      "files": ["docs/threat-model.md", "evidence/week-03/individual.json", ".github/workflows/week-03-ci-amenazas-feedback.yml"],
      "tests": ["npm test -- --ci --runInBand course-tests/public/week-03.test.ts (no ejecutado: Node.js 22.22 no disponible)"],
      "reviews": ["visible() coincide con el control documentado y .gitignore cubre .env y los tipos de firma encontrados.\nEl workflow de Semana 03 estaba ausente y fue reconstruido con los comandos y permisos definidos por el contrato y los workflows existentes.\nLas pruebas disponibles no demuestran mediante GET separado todos los casos positivos descritos por el control; el threat model ahora diferencia implementacion y evidencia.", "El secret_scan existe, pero su alcance es de patrones concretos de credenciales y no cubre automaticamente cualquier dato sensible de negocio."],
      "prediction": "Esperaba encontrar visible() y las restricciones por rol implementadas, reglas de exclusión para .env y archivos de firma, y un workflow de Semana 03 con permisos mínimos. También esperaba comprobar que la evidencia de pruebas era más limitada que la implementación completa del control.",
      "command": "Get-Content evidence/week-03/individual.json -Raw | ConvertFrom-Json; Select-String -Path .github/workflows/week-03-ci-amenazas-feedback.yml -Pattern 'permissions:|contents: read|make setup|npm run bundle:release|make verify-week-03|make public-test-week-03|continue-on-error|\\|\\| true'; npm test -- --ci --runInBand course-tests/public/week-03.test.ts",
      "observedResult": "visible() permite al coordinador, al reportante original y al técnico asignado, y bloquea relaciones ajenas. .gitignore contiene .env, *.jks, *.keystore, *.p8 y *.p12, pero no .env.*. El workflow de Semana 03 no existía antes de esta aportación. secret_scan está implementado con patrones concretos; el self-test prueba el reportante ajeno y no separa mediante GET todos los accesos positivos.",
      "explanation": "Ajusté el threat model para separar el control implementado de los casos realmente verificados, limité la descripción de secret_scan a su alcance real y añadí el workflow requerido siguiendo el contrato, el Makefile y el patrón local, sin modificar visible() ni afirmar pruebas no realizadas."
    }
  ]
}
