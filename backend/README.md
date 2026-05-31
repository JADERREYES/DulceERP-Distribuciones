# DulceERP Distribuciones Backend

API REST con Node.js, Express, MongoDB, Mongoose y JWT.

## Instalacion

```bash
npm install
copy .env.example .env
npm run seed
npm run dev
```

El backend queda disponible en `http://localhost:5000/api`.

## Usuario administrador

- Email: `admin@dulceerp.com`
- Password: `Admin12345`

## Scripts

- `npm run dev`: inicia Express con nodemon.
- `npm start`: inicia Express con Node.
- `npm run seed`: crea usuario admin y datos base.
- `npm run test:mongo`: prueba DNS SRV y conexion con MongoDB Atlas.
- `npm run check:api`: valida conexion MongoDB y lista rutas principales.
- `npm run kill:5000`: libera el puerto 5000 en Windows.

## Health check

Con el backend encendido puedes validar el estado de la API y MongoDB:

```bash
curl http://localhost:5000/api/health
```

En PowerShell:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

Tambien puedes abrir en el navegador:

- `http://localhost:5000`
- `http://localhost:5000/api/health`

Si aparece `ERR_CONNECTION_REFUSED`, el backend no esta corriendo o el puerto no esta disponible. Ejecuta:

```powershell
npm run kill:5000
npm run dev
```

## Solucion a error querySrv ECONNREFUSED en MongoDB Atlas

El error `querySrv ECONNREFUSED` ocurre cuando Node.js no puede resolver los registros DNS SRV que usa MongoDB Atlas en las URIs `mongodb+srv://`.

Para reducir ese problema, `src/config/db.js` fuerza DNS publicos antes de conectar:

- `8.8.8.8`
- `1.1.1.1`

Puedes probar la resolucion DNS y la conexion real con:

```bash
npm run test:mongo
```

Si sigue fallando, revisa en MongoDB Atlas:

- `Database Access`: usuario de base de datos y contrasena.
- `Network Access`: lista de IPs permitidas.
- `IP Access List`: agrega tu IP actual o una regla temporal de prueba.
- Que el cluster y el nombre del host en `MONGO_URI` sean correctos.

Si Atlas esta correcto y el error persiste, revisa firewall, antivirus, red corporativa, VPN o bloqueo de salida al puerto `27017`.
