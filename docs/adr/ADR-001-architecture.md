# ADR-001: Arquitectura por capas para CampusOps

## Contexto

CampusOps tendrá pantallas, reglas de incidencias, sesión, almacenamiento y servicios de ubicación. El stack (React Native, Expo, TypeScript) ya está fijado. Necesitamos separar responsabilidades para poder probar la lógica sin depender de un backend real, y poder cambiar de proveedor (por ejemplo, el almacenamiento o el servicio de mapas) sin reescribir la interfaz de usuario.

## Alternativas consideradas

1. **Todo en los componentes de pantalla (UI monolítica):** cada pantalla llamaría directamente a fetch/HTTP, AsyncStorage y cualquier SDK externo desde dentro del propio componente React Native. Es rápido de escribir al inicio, pero mezcla presentación con reglas de negocio y detalles de infraestructura, dificultando las pruebas unitarias y encareciendo cualquier cambio de proveedor.
2. **Arquitectura por capas (UI - Application - Domain - Infrastructure):** la UI solo invoca casos de uso de la capa de aplicación; la aplicación depende de un contrato (interfaz) definido en el dominio; la infraestructura implementa ese contrato. Permite sustituir la infraestructura (por ejemplo, cambiar de un fake en memoria a una API real) sin tocar la UI ni las reglas de negocio.

## Decisión

Se elige la arquitectura por capas (alternativa 2). La UI depende únicamente de la capa de aplicación; la aplicación depende del contrato definido en el dominio; la infraestructura implementa ese contrato mediante un repositorio en memoria esta semana. La UI nunca importa directamente de infraestructura.

## Consecuencias

- **Beneficio (testabilidad):** los casos de uso de aplicación y el dominio se pueden probar sin renderizar componentes ni depender de un backend real.
- **Beneficio (cambio de proveedor):** sustituir el repositorio en memoria por uno que consuma la API real de CampusOps (semana 5) no requerirá cambios en la UI ni en los casos de uso, solo una nueva implementación del contrato.
- **Costo (complejidad):** se agregan capas y archivos adicionales (contratos, casos de uso) en comparación con escribir todo directo en la pantalla, lo cual implica más código para un alcance tan pequeño como el de esta semana.
- **Trade-off:** se acepta mayor complejidad inicial y más archivos a cambio de facilidad de prueba y bajo costo de cambiar de proveedor en semanas futuras (backend real, persistencia, geolocalización).
