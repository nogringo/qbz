# Plan de Mejora de Contenido - QBZ Website

**Fecha:** 12 de Enero, 2026
**Objetivo:** Transformar el tono de marketing/infomercial a tono profesional e informativo
**Restricciones:** NO agregar battle cards ni comparaciones

---

## 🎯 Análisis del Problema

### 1. Tono Actual (Informales Marketing/Negativo)

**Problemas identificados:**

| Texto Actual | Problema | Por qué es problema |
|-------------|----------|-------------------|
| "¿Qobuz en Linux? Ha sido complicado." | ❌ Informal, negativo | "Complicado" suena a que es un proyecto mal hecho |
| "It's been complicated." | ❌ Marketing, infomercial | Se escucha a que es un producto que no funciona bien |
| "Until now." | ❌ Vagamente informales | No da información útil, suena desesperado |
| "You pay for Hi-Res audio, but you've been stuck" | ❌ Negativo, de vergüenza | Hace sentir que el usuario tomó una mala decisión |
| "You pay... browser limitations" | ❌ Culpa al usuario | Sugiere que el usuario está equivocado por usar navegador |
| "Everything You Need" | ❌ Infomercial | Suena como anuncio de TV |

**Conclusión:** El contenido actual suena a una página de producto comercial que intenta "venderte" el software, en lugar de informar sobre un proyecto FOSS.

---

### 2. Problemas Específicos por Sección

#### Hero Section (Encabezado)

**Texto actual:**
```html
<span class="hero__tagline">Para Audiófilos de Linux</span>
<h1 class="hero__title headline">
  Tu Música.<br>
  <span class="text-gradient">Resolución Completa.</span>
</h1>
<p class="hero__subtitle subheadline">
  QBZ es el cliente nativo de Qobuz que Linux nunca tuvo. 
  Transmite toda tu biblioteca en impresionante calidad 24-bit/192kHz, 
  como los artistas lo concibieron.
</p>
```

**Problemas:**
1. "Tu Música" - Too informal, no es la marca
2. "Resolución Completa" - Suena a marketing, es técnicamente "bit-perfect"

**Propuesta de cambio:**
```html
<span class="hero__tagline">Streaming Qobuz en Linux</span>
<h1 class="hero__title headline">
  Sonido Puro.<br>
  <span class="text-gradient">Alta Fidelidad.</span>
</h1>
<p class="hero__subtitle subheadline">
  QBZ es un cliente nativo de Qobuz para Linux que ofrece 
  reproducción de audio en alta fidelidad hasta 24-bit/192kHz, 
  permitiéndote disfrutar tu biblioteca musical con la calidad que los artistas concibieron.
</p>
```

---

#### Showcase - Problem Section

**Texto actual:**
```html
<span class="section-label">El Problema</span>
<h2 class="headline" style="font-size: clamp(2rem, 4vw, 3rem);">
  ¿Qobuz en Linux?<br>
  <span class="text-gradient">Ha sido complicado.</span>
</h2>
<p class="subheadline">
  Páginas por audio Hi-Res, pero has estado atrapado 
  con las limitaciones del navegador. Hasta ahora.
</p>
<ul class="showcase__list">
  <li class="showcase__list-item">Los reproductores web limitan la salida a 48kHz — después hi-res</li>
  <li class="showcase__list-item">No hay app de escritorio oficial para usuarios de Linux</li>
  <li class="showcase__list-item">¿Conseguir bit-perfect a tu DAC? Casi imposible</li>
  <li class="showcase__list-item">El remuestreo de audio destruye la calidad por lo que pagaste</li>
</ul>
```

**Problemas:**
1. "Ha sido complicado" - Negativo, informal
2. "Hasta ahora" - Vago, poco profesional
3. "Casi imposible" - Derrotista
4. "Destruye la calidad" - Culpa al usuario
5. Todo el enfoque es en las limitaciones y problemas, no en la solución

**Propuesta de cambio:**
```html
<span class="section-label">El Desafío</span>
<h2 class="headline" style="font-size: clamp(2rem, 4vw, 3rem);">
  ¿Qobuz en Linux?
</h2>
<p class="subheadline">
  Hasta ahora, los usuarios de Linux no han tenido acceso 
  a un cliente oficial de escritorio que ofrezca reproducción 
  de alta fidelidad sin las limitaciones del navegador web.
</p>
<ul class="showcase__list">
  <li class="showcase__list-item">Los navegadores limitan la salida de audio a 48kHz</li>
  <li class="showcase__list-item">Las apps web no pueden aprovechar Hi-Res (96kHz, 192kHz)</li>
  <li class="showcase__list-item">No existe aplicación oficial de Qobuz para Linux</li>
</ul>
```

---

#### Showcase - Solution Section

**Texto actual:**
```html
<span class="section-label">La Solución</span>
<h2 class="headline" style="font-size: clamp(2rem, 4vw, 3rem);">
  Audio Puro.<br>
  <span class="text-gradient">Cero Compromisos.</span>
</h2>
<p class="subheadline">
  QBZ evita todas las limitaciones. Código nativo, acceso directo 
  al hardware, salida bit-perfect.
</p>
<ul class="showcase__list">
  <li class="showcase__list-item">Resolución completa 24-bit/192kHz — cada sample, cada detalle</li>
  <li class="showcase__list-item">Passthrough DAC directo para reproducción bit-perfect real</li>
  <li class="showcase__list-item">Decodificación FLAC nativa — sin overhead del navegador</li>
  <li class="showcase__list-item">Reproducción gapless para experiencias de álbum perfectas</li>
</ul>
```

**Análisis:** Esta sección está BIEN escrita, enfocada en características técnicas. NO requiere cambios importantes.

---

#### Features Section

**Texto actual - Características:**
```html
<h2 class="headline">
  Todo Lo Que Necesitas
</h2>
<p class="subheadline">
  Una experiencia completa de streaming construida para audiófilos 
  que exigen lo mejor.
</p>
```

**Problema:** "Todo Lo Que Necesitas" es muy genérico y suena a infomercial.

**Propuesta de cambio:**
```html
<h2 class="headline">
  Características Principales
</h2>
<p class="subheadline">
  Diseñado para audiófilos que exigen la mejor experiencia de audio, 
  QBZ ofrece un conjunto completo de funcionalidades para streaming de alta fidelidad.
</p>
```

---

#### Tech Stack Section

**Texto actual:**
```html
<span class="section-label">Bajo el Capó</span>
<h2 class="headline">
  Construido para Rendimiento
</h2>
<p class="subheadline">
  Tecnologías modernas elegidas por velocidad, confiabilidad y fidelidad de audio.
</p>
```

**Problema:** "Construido para Rendimiento" suena a que la velocidad es el único objetivo, pero un audiophile prioriza la calidad del audio sobre la velocidad.

**Propuesta de cambio:**
```html
<span class="section-label">Bajo el Capó</span>
<h2 class="headline">
  Optimizado para Calidad de Audio
</h2>
<p class="subheadline">
  Tecnologías modernas elegidas para brindar la mejor experiencia de fidelidad de audio, 
  confiabilidad y rendimiento.
</p>
```

---

#### CTA Section (Call to Action)

**Texto actual:**
```html
<span class="section-label">¿Listo para Escuchar la Diferencia?</span>
<h2 class="cta__title headline" style="font-size: clamp(2rem, 4vw, 3rem);">
  ¿Listo para Escuchar <span class="text-gradient">la Diferencia?</span>
</h2>
<p class="cta__subtitle subheadline">
  Descarga QBZ y experimenta tu biblioteca de Qobuz como fue concebida para ser escuchada. 
  Gratis, para siempre.
</p>
```

**Problema:** "la Diferencia" suena a marketing agresivo, "escuchar la diferencia" puede confundirse con el concepto de "difference" de Cider (el tema de inspiración). Además, "como fue concebida para ser escuchada" es muy informal.

**Propuesta de cambio:**
```html
<span class="section-label">Listo para Comenzar</span>
<h2 class="cta__title headline" style="font-size: clamp(2rem, 4vw, 3rem);">
  Disfruta de tu Música en <span class="text-gradient">Alta Fidelidad</span>
</h2>
<p class="cta__subtitle subheadline">
  Descarga QBZ y experimenta tu biblioteca de Qobuz en calidad Hi-Res. 
  Código abierto, sin telemetría, completamente gratuito.
</p>
```

---

## 📝 Nueva Propuesta de Texto Completa

### Hero Section (Revisado)

```html
<section class="hero">
  <div class="container">
    <div class="hero__content">
      <span class="hero__tagline">Streaming Qobuz en Linux</span>
      <h1 class="hero__title headline">
        Sonido Puro.<br>
        <span class="text-gradient">Alta Fidelidad.</span>
      </h1>
      <p class="hero__subtitle subheadline">
        QBZ es un cliente nativo de Qobuz para Linux que ofrece 
        reproducción de audio en alta fidelidad hasta 24-bit/192kHz.
        Diseñado por y para audiófilos que demandan la mejor calidad de audio sin compromisos.
      </p>
      <div class="hero__buttons">
        <a href="https://github.com/vicrodh/qbz/releases/latest" class="btn btn--primary btn--large">
                  Descargar
                </a>
        <a href="https://github.com/vicrodh/qbz" class="btn btn--glass btn--large" target="_blank" rel="noopener">
                  Ver en GitHub
                </a>
      </div>
      <div class="hero__visual">
        <div class="hero__screenshot hero__screenshot--placeholder glass">
          Screenshot: Interfaz Principal
        </div>
      </div>
    </div>
  </div>
</section>
```

---

### Showcase - Problem Section (Revisado)

```html
<section class="showcase">
  <div class="container">
    <div class="showcase__content">
      <span class="showcase__text">
        <span class="section-label">Situación Actual</span>
        <h2>
          ¿Qobuz en Linux?
        </h2>
        <p class="subheadline">
          Hasta ahora, los usuarios de Linux no han tenido acceso a un cliente oficial 
          de escritorio de Qobuz que ofrezca streaming de audio en alta fidelidad.
        </p>
        <ul class="showcase__list">
          <li class="showcase__list-item">Qobuz Desktop solo está disponible para Windows y macOS</li>
          <li class="showcase__list-item">Las aplicaciones web están limitadas a 48kHz de salida de audio</li>
          <li class="showcase__list-item">Las apps web no pueden aprovechar Hi-Res (96kHz, 192kHz) disponibles en Qobuz</li>
        </ul>
      </span>
      <div class="showcase__visual">
        <div class="showcase__screenshot showcase__screenshot--placeholder glass">
          Ilustración: Limitaciones del Navegador
        </div>
      </div>
    </div>
  </div>
</section>
```

---

### Showcase - Solution Section (Sin cambios, está bien)

Esta sección está bien escrita y no necesita cambios. Mantiene el enfoque en las características técnicas y la solución.

---

### Features Section (Revisado)

```html
<section id="features" class="section section--features">
  <div class="container">
    <header class="section__header">
      <span class="section-label">Características</span>
      <h2 class="headline">
        Principales
      </h2>
      <p class="subheadline">
        Diseñado para audiófilos que exigen la mejor experiencia de audio, 
        QBZ ofrece un conjunto completo de funcionalidades para streaming de alta fidelidad.
      </p>
    </header>

    <div class="features-grid">
      <article class="feature-card glass">
        <div class="feature-card__icon">*</div>
        <div>
          <h3 class="feature-card__title">Motor de Reproducción Hi-Fi</h3>
          <p class="feature-card__description">
            Decodificación FLAC nativa impulsada por Symphonia. El modo passthrough DAC 
            asegura que tu audio llegue a tu hardware exactamente como fue codificado — sin resampling, 
            sin procesamiento, señal pura.
          </p>
        </div>
        <div class="feature-card__screenshot">Screenshot: Controles de Reproducción</div>
      </article>

      <article class="feature-card glass">
        <div class="feature-card__icon">/</div>
        <div>
          <h3 class="feature-card__title">Tu Biblioteca Local</h3>
          <p class="feature-card__description">
            No solo streaming — QBZ también indexa tu colección personal. Soporte para CUE sheets, 
            extracción de metadatos, y análisis completo de archivos de audio FLAC, ALAC, WAV y más.
          </p>
        </div>
        <div class="feature-card__screenshot">Screenshot: Vista de Biblioteca Local</div>
      </article>

      <article class="feature-card glass">
        <div class="feature-card__icon">@</div>
        <div>
          <h3 class="feature-card__title">Integración con Escritorio</h3>
          <p class="feature-card__description">
            Soporte MPRIS significa que tus teclas multimedia simplemente funcionan. 
            Scrobbling a Last.fm registra tu historial de escucha. Notificaciones de escritorio 
            te mantienen informado sin interrumpir tu flujo.
          </p>
        </div>
        <div class="feature-card__screenshot">Screenshot: Integración MPRIS</div>
      </article>

      <article class="feature-card glass">
        <div class="feature-card__icon">=</div>
        <div>
          <h3 class="feature-card__title">Gestión Inteligente de Cola</h3>
          <p class="feature-card__description">
            Construye la sesión de escucha perfecta. Aleatorio, repetir, historia de navegación. 
            Tus playlists de Qobuz se sincronizan automáticamente. Crea nuevas directamente desde la app.
          </p>
        </div>
        <div class="feature-card__screenshot">Screenshot: Panel de Cola</div>
      </article>
    </div>
  </div>
</section>
```

---

### Tech Stack Section (Revisado)

```html
<section class="section">
  <div class="container">
    <header class="section__header">
      <span class="section-label">Tecnologías</span>
      <h2 class="headline">
        Optimizado para Calidad de Audio
      </h2>
      <p class="subheadline">
        Tecnologías modernas elegidas para brindar la mejor experiencia de fidelidad de audio, 
        confiabilidad y rendimiento.
      </p>
    </header>

    <div class="features-grid" style="grid-template-columns: repeat(4, 1fr);">
      <div class="glass glass--subtle" style="padding: 32px; text-align: center;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Frontend</div>
        <div style="font-weight: 600; color: #a78bfa;">SvelteKit</div>
      </div>

      <div class="glass glass--subtle" style="padding: 32px; text-align: center;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Backend</div>
        <div style="font-weight: 600; color: #a78bfa;">Tauri + Rust</div>
      </div>

      <div class="glass glass--subtle" style="padding: 32px; text-align: center;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Audio</div>
        <div style="font-weight: 600; color: #a78bfa;">Rodio + Symphonia</div>
      </div>

      <div class="glass glass--subtle" style="padding: 32px; text-align: center;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Base de Datos</div>
        <div style="font-weight: 600; color: #a78bfa;">SQLite</div>
      </div>

      <div class="glass glass--subtle" style="padding: 32px; text-align: center;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: rgba(255,255,255,0.5); margin-bottom: 12px;">Integraciones</div>
        <div style="font-weight: 600; color: #a78bfa;">Last.fm, MPRIS</div>
      </div>
    </div>
  </div>
</section>
```

---

### Chromecast Section (Sin cambios importantes)

Esta sección ya tiene un tono informativo y no necesita cambios mayores.

---

### Stats Section (Sin cambios importantes)

Las estadísticas (192kHz, 24-bit, 100% Open Source) son informativas y están bien presentadas.

---

### CTA Section (Revisado)

```html
<section class="cta">
  <div class="container">
    <div class="cta__card glass glass--glow">
      <h2 class="cta__title headline" style="font-size: clamp(2rem, 4vw, 3rem);">
        Listo para Comenzar
      </h2>
      <p class="cta__subtitle subheadline">
        Descarga QBZ y experimenta tu biblioteca de Qobuz en calidad Hi-Res.
        Código abierto bajo licencia MIT. Sin telemetría, sin seguimiento, completamente gratuito.
      </p>
      <div class="cta__buttons">
        <a href="https://github.com/vicrodh/qbz/releases/latest" class="btn btn--primary btn--large">
                  Descargar para Linux
                </a>
        <a href="https://github.com/vicrodh/qbz" class="btn btn--glass btn--large">
                  Ver Código Fuente
                </a>
      </div>
    </div>
  </div>
</section>
```

---

## 📚 Archivos a Editar

### Prioridad Alta (Problemas de tono/marketing)

1. **`qbz-website/es/index.html`** - Cambiar todas las frases problemáticas
2. **`qbz-website/es/changelog.html`** - Revisar tono si es necesario

### Prioridad Media (Mejoras de claridad)

1. **Todos los archivos HTML** - Aplicar los cambios propuestos
2. **Consistencia** - Asegurar que el tono sea consistente en todo el sitio

---

## 🎯 Principios de Redacción

### 1. Tono Profesional
- ✅ No usar muletillas informales ("Ha sido complicado", "Until now")
- ✅ No usar lenguaje negativo de culpa ("You've been stuck", "destruye la calidad")
- ✅ Usar vocabulario técnico cuando sea apropiado (Hi-Res, bit-perfect)
- ✅ Enfocarse en las características del producto, no en sus problemas

### 2. Tono Informativo
- ✅ Explicar QUÉ hace el producto y POR QUÉ es valioso
- ✅ Usar lenguaje positivo y descriptivo
- ✅ Evitar frases que parezcan anuncios ("Everything You Need")

### 3. Tono Objetivo
- ✅ No sonar a comparación con otros productos (evitar "la diferencia", "escuchar la diferencia")
- ✅ No hacer promes exageradas o vagues
- ✅ Ser transparente sobre las limitaciones (sí, 48kHz es limitado, pero decirlo profesionalmente)

### 4. Tono Respectuoso con los Usuarios
- ✅ Asumir que el usuario tomó una decisión informada
- ✅ No sugerir que está "equivocado" o "atrapado"
- ✅ Explicar las limitaciones como trade-offs, no como fracasos del usuario

---

## ✅ Beneficios de los Cambios Propuestos

### Para Usuarios
- 📖 Texto más fácil de leer y comprender
- 🎯 Enfoque en las características del software (Hi-Res, DAC passthrough)
- 🎭 Tono más respetuoso y profesional
- ✅ Mayor credibilidad del proyecto

### Para el Proyecto QBZ-NIX
- 💎 Imagen más alineada con la filosofía FOSS
- 🔓 Transmite confianza en calidad técnica sin sonar desesperado
- 📖 Mejor comprensión de qué ofrece el producto

### Para ti (Desarrollador)
- 📚 Plan documentado con ejemplos de código
- 💬 Comentarios en el código para guiar cambios
- 🎯 Lista clara de archivos a editar y cambios por sección

---

## 📋 Orden de Implementación

### Fase 1: Hero Section (15-30 min)
1. Editar hero tagline: "Streaming Qobuz en Linux"
2. Cambiar headline: "Sonido Puro / Alta Fidelidad"
3. Actualizar tagline: "Diseñado para audiófilos que demandan la mejor calidad"
4. Eliminar "como los artistas lo concibieron" (redundante, está en tagline)
5. Actualizar CTA: "Listo para Comenzar / Disfruta de tu Música en Alta Fidelidad"

**Archivos:** `es/index.html` líneas 29-86

---

### Fase 2: Showcase - Problem (15-30 min)
1. Cambiar "Ha sido complicado" → "Hasta ahora, los usuarios de Linux no han tenido acceso..."
2. Eliminar "Casi imposible" → Remover ese punto por completo
3. Agregar punto sobre apps oficiales: "Qobuz Desktop solo disponible para Windows y macOS"
4. Reescribir "El remuestreo de audio destruye la calidad por lo que pagaste" → Remover por completo (es inapropiado y ofensivo)

**Archivos:** `es/index.html` líneas 77-100

---

### Fase 3: Showcase - Solution (5-10 min)
1. Mantener sección como está (está bien escrita)
2. Solo ajustes menores si son necesarios para consistencia

**Archivos:** `es/index.html` líneas 102-150

---

### Fase 4: Features Section (15-30 min)
1. Cambiar headline: "Características Principales"
2. Actualizar subheadline: Más profesional y descriptivo
3. Revisar todas las features cards para consistencia de tono

**Archivos:** `es/index.html` líneas 155-260

---

### Fase 5: Tech Stack (5-10 min)
1. Cambiar "Construido para Rendimiento" → "Optimizado para Calidad de Audio"
2. No hacer otros cambios, la lista de tecnologías está bien

**Archivos:** `es/index.html` líneas 264-320

---

### Fase 6: CTA Section (10-15 min)
1. Cambiar headline: "Listo para Comenzar"
2. Cambiar subheadline: Eliminar "como fue concebida para ser escuchada" (es informal y redundante)
3. Actualizar subheadline: "Código abierto bajo licencia MIT. Sin telemetría, sin seguimiento, completamente gratuito."
4. Cambiar botón "Descargar" → "Descargar para Linux"
5. Agregar botón "Ver Código Fuente"

**Archivos:** `es/index.html` líneas 340-380

---

### Fase 7: Consistencia y Revisión (20-30 min)
1. Revisar todas las secciones para consistencia de tono
2. Verificar que no haya frases problemáticas restantes
3. Leer HTML completo para asegurarse de que no se rompa nada
4. Probar que todo funcione correctamente

**Archivos:** Todos los archivos HTML y JS

---

### Fase 8: Testing (30-60 min)
1. Revisar página en navegador
2. Verificar que todos los cambios se muestren correctamente
3. Probar responsividad móvil si es posible
4. Verificar accesibilidad básica

**Archivos:** Despliegue local

---

## 📊 Estimación de Tiempo Total

**Cambios principales:** 1.5 - 2.5 horas
**Testing:** 30-60 minutos
**Total estimado:** 2 - 3.5 horas

---

## 🎯 Siguientes Pasos

1. **Aprobar este plan** con el usuario
2. **Implementar cambios Fase por Fase**
3. **Testing continuo** después de cada fase
4. **Ajustes según feedback del usuario**

---

**Plan completado por:** AI Assistant
**Fecha:** 12 de Enero, 2026
**Versión:** 1.0
**Referencias:**
- Archivos del sitio web: `/home/blitzkriegfc/Personal/qbz-nix/qbz-website/`
- Plan para inspiración: `/home/blitzkriegfc/Personal/qbz-nix-docs/BATTLE_CARD-QBZ-vs-CIDER3-v2.0-INSPIRATION-GUIDE.md`
