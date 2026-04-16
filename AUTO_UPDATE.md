# Auto-update con GitHub Releases (Windows)

## Requisitos
- Repositorio en GitHub con Releases habilitado.
- Token de GitHub con permisos para publicar releases.
- En `package.json`, reemplazar:
  - `build.publish[0].owner` (`REEMPLAZAR_OWNER`)
  - `build.publish[0].repo` (`REEMPLAZAR_REPO`)
- Variable de entorno `GH_TOKEN` para publicar releases automáticamente.

## Flujo de versionado
1. Cambia la versión en `package.json` (por ejemplo `1.0.0` -> `1.0.1`).
2. Compila instalador:
   - `npm run build`
3. Publica release:
   - Opción manual: subir `.exe` y `latest.yml` a un Release en GitHub.
   - Opción automática: `npm run build:publish` (requiere `GH_TOKEN`).

## Qué archivos debes publicar
- Instalador `.exe` generado en `dist/`.
- Archivo `latest.yml` generado en `dist/`.

Sin esos dos artefactos, la app no podrá detectar/descargar updates correctamente.

## Comportamiento en la app
- Botón **Buscar actualización**:
  - ejecuta `check-for-updates`.
- Si hay versión nueva:
  - descarga en segundo plano y muestra progreso.
- Al terminar:
  - aparece **Instalar ahora**.
- Botón **Instalar ahora**:
  - ejecuta `quitAndInstall`, reinicia y aplica la actualización.

## Notas importantes
- El auto-update real funciona solo en app instalada (no en `npm start` de desarrollo).
- En modo desarrollo se muestra estado informativo y no intenta instalar.
- Mantén `target: nsis` para compatibilidad con instalación/reinicio en Windows.

## Checklist rápido de publicación
- [ ] `package.json` con versión nueva.
- [ ] `build.publish.owner` y `build.publish.repo` apuntan al repo real.
- [ ] `npm run build` ejecutado sin errores.
- [ ] Release creado en GitHub.
- [ ] Adjuntados `latest.yml` y `.exe`.
- [ ] Probar en una instalación previa (versión antigua).

## Troubleshooting común en Windows
- Error de symlink al compilar (`Cannot create symbolic link`):
  - Ejecuta terminal/IDE como administrador, o
  - Activa Developer Mode en Windows.
