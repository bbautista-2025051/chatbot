# Colágeno Vital · Plataforma Web y Chatbot con Google Gemini AI

Aplicación web completa (Landing pública, Panel de Administración, Base de Conocimiento RAG y Chatbot embebible) rediseñada y preparada con integración centralizada y segura para **Google Gemini API**.

---

## 1. Características principales

- **Interfaz de usuario (UI/UX) moderna y unificada**:
  - Sistema de diseño coherente (`public/assets/base.css`) con jerarquía visual clara, paleta farmacéutica/bienestar, iconografía uniforme y estados completos de interacción en botones (`hover`, `active`, `focus-visible`, `disabled`).
  - Navegación responsive en computadoras, tablets y dispositivos móviles (incluyendo menú móvil en la landing y barra adaptable con acceso a cierre de sesión en el panel administrativo).
  - Formularios validados con campos obligatorios identificados (`*`), mensajes de error en línea, alertas contextuales e indicadores de carga.
- **Chatbot interactivo preparado para Google Gemini AI**:
  - **Botón flotante (`public/widget.js`)** que permite abrir y cerrar la ventana de conversación en cualquier momento.
  - **Ventana de conversación adaptable (`public/embed.html`)** con diseño diferenciado para mensajes del usuario y del asistente, avatar, marca de tiempo y botón para copiar respuestas.
  - **Soporte completo para Markdown** en respuestas del asistente (encabezados, listas con viñetas y numeradas, negritas, cursivas, citas, bloques de código y enlaces seguros).
  - **Envío con tecla `Enter`** (`Shift + Enter` para salto de línea) y botón de envío con indicador de carga.
  - **Indicador visual de procesamiento** mientras Gemini genera la respuesta y bloqueo contra solicitudes duplicadas en curso.
  - **Historial de conversación persistente durante la sesión** (`GET /api/public/chat/history`) y botón **"Nuevo chat"** (`POST /api/public/chat/reset`) para iniciar una nueva conversación limpia.
  - **Manejo visual de errores** con banner de alerta y botón **"Reintentar"** en caso de fallo de red o del proveedor.
- **Arquitectura Backend segura para Google Gemini (`server/llm/gemini.js`)**:
  - Servicio independiente que centraliza la resolución de configuración, validación de entrada, control de peticiones en vuelo (`409 Conflict` ante envíos duplicados simultáneos), tiempos de espera (`GEMINI_TIMEOUT_MS`), reintentos ante errores transitorios y cadena de modelos de respaldo.
  - **Seguridad estricta**: la `GEMINI_API_KEY` se gestiona exclusivamente en el servidor mediante variables de entorno (`.env`) o almacenamiento enmascarado del servidor, enviándose por cabecera `x-goog-api-key` y **nunca** exponiéndose en el frontend ni en rutas públicas.

---

## 2. Requisitos previos

- **Node.js 18.17 o superior** (recomendado Node.js 20 LTS o superior).
- Una clave de API de Google Gemini obtenida en [Google AI Studio](https://aistudio.google.com/app/apikey) (opcional para pruebas iniciales: si no se define, la aplicación opera de forma controlada con su modo de respaldo basado en la base de conocimiento local).

---

## 3. Configuración paso a paso de Google Gemini API

### Paso 1: Instalar dependencias y crear el archivo `.env`

En la raíz del proyecto, ejecuta:

```bash
npm install
copy .env.example .env      # En Windows PowerShell / CMD (en Linux/macOS: cp .env.example .env)
```

### Paso 2: Configurar `GEMINI_API_KEY` y variables del modelo en `.env`

Abre el archivo `.env` y define tu clave de Google Gemini API:

```env
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
ADMIN_PASSWORD=admin123

# Proveedor principal de IA
AI_PROVIDER=gemini

# Credenciales y configuración de Google Gemini API (NUNCA exponer en el frontend)
GEMINI_API_KEY=TU_API_KEY_DE_GOOGLE_GEMINI_AQUI
GEMINI_MODEL=gemini-3.8-flash
GEMINI_EMBEDDING_MODEL=text-embedding-004
GEMINI_TEMPERATURE=0.4
GEMINI_MAX_TOKENS=700
GEMINI_TIMEOUT_MS=25000
```

> **Nota sobre cómo cambiar el modelo sin modificar el código:**
> Puedes cambiar `GEMINI_MODEL` en `.env` (por ejemplo a `gemini-3.8-flash`, `gemini-3.6-flash` o `gemini-3.5-flash-lite`) o seleccionarlo directamente desde **Panel Admin → Ajustes e IA → Modelo de Inteligencia Artificial**.

### Paso 3: Cargar datos semilla (opcional si `data/` ya existe) e iniciar el servidor

```bash
npm run seed
npm start
```

Para desarrollo con recarga automática:

```bash
npm run dev
```

### Paso 4: Verificar la conexión con Gemini

1. Abre `http://localhost:3000/admin` e inicia sesión (contraseña inicial: `admin123`).
2. Dirígete a **Ajustes e IA → Modelo de Inteligencia Artificial**.
3. Pulsa el botón **"Probar conexión con el modelo"** para verificar la latencia y respuesta de Google Gemini API.
4. Abre `http://localhost:3000/` o `http://localhost:3000/embed.html` y conversa con el chatbot.

---

## 4. Rutas y Endpoints principales

### Vistas de la aplicación

| Vista | Ruta | Descripción |
| :--- | :--- | :--- |
| **Landing pública** | `http://localhost:3000/` | Página principal con catálogo, sección interactiva de Gemini AI y widget flotante |
| **Ventana del Chatbot** | `http://localhost:3000/embed.html` | Interfaz completa del chatbot (embebible o en pantalla completa) |
| **Script del Widget** | `http://localhost:3000/widget.js` | Script para integrar el botón flotante en cualquier página web |
| **Panel de Administración** | `http://localhost:3000/admin` | Gestión de entrenamiento RAG, configuración de Gemini, conversaciones, leads y canales |

### Endpoints de la API Pública del Chatbot

| Método y Ruta | Descripción |
| :--- | :--- |
| `GET /api/public/health` | Estado del servidor y metadatos públicos seguros del motor IA (sin exponer claves) |
| `GET /api/public/config` | Configuración visual del negocio, asistente y estado del proveedor para el widget |
| `GET /api/public/chat/history?sessionId=...` | Recupera el historial de mensajes de la sesión actual |
| `POST /api/public/chat` | Envía un mensaje al asistente (incluye validación y bloqueo `409` ante peticiones simultáneas) |
| `POST /api/public/chat/reset` | Reinicia la conversación de la sesión actual y devuelve un nuevo `sessionId` |

---

## 5. Estructura relevante del proyecto

```text
server/
  index.js              Servidor Express, rutas estáticas y cabeceras de seguridad
  config/defaults.js    Configuración por defecto (proveedor Gemini y variables de entorno)
  llm/
    gemini.js           Servicio centralizado e independiente para Google Gemini API
    providers.js        Adaptador unificado de proveedores (Gemini, OpenAI, Claude, Demo)
    embeddings.js       Generación de embeddings locales, Gemini y OpenAI
  chat/
    engine.js           Motor conversacional, historial, bloqueo de duplicados y respaldo RAG
    prompt.js           Construcción dinámica del prompt del sistema
  routes/
    public.js           Endpoints públicos del chatbot (/chat, /chat/history, /chat/reset)
    admin.js            Endpoints protegidos del panel de administración
public/
  index.html            Landing pública rediseñada con sección interactiva de Gemini AI
  embed.html            Interfaz del chatbot con soporte Markdown, historial y reintento
  admin.html            Panel de administración responsive
  widget.js             Botón flotante para abrir y cerrar el chatbot
  assets/
    base.css            Sistema de diseño base, estados de botones, formularios y Markdown
    landing.css         Estilos de la landing pública y menú móvil
    embed.css           Estilos modernos de la ventana del chatbot
    embed.js            Lógica del chatbot (Markdown, historial, nuevo chat, manejo de errores)
    admin.css           Estilos del panel de administración
    admin-core.js       Núcleo del panel, modales, validaciones y Markdown
    admin-settings.js   Configuración de Gemini AI, negocio y consola de pruebas
    admin-social.js     Conversaciones, leads, canales sociales y configuración del widget
```
