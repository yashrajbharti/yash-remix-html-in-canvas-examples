# HTML-in-Canvas Examples

A collection of experiments using the experimental **"HTML in Canvas"** API. This API bridge provides a way to render standard HTML/CSS content directly into a `<canvas>` element (both 2D and 3D) while maintaining full accessibility, interactive hit-testing, and high-performance synchronization.

## 🌟 The Core Idea

The HTML-in-Canvas API solves a fundamental gap in web graphics: rendering complex, interactive, and accessible layouts (like Material Design or rich text) inside a canvas without reinventing the layout engine in JS.

### Key Primitives
- **`layoutsubtree`**: A new attribute that tells the browser to perform layout for elements inside a `<canvas>` even if they aren't visible in the main DOM tree.
- **`drawElementImage()`**: A method for 2D contexts to capture a high-quality "snapshot" of a child element and paint it into the canvas.
- **`texElementImage2D()`**: The WebGL equivalent for rendering DOM elements directly into a texture (see `webGL.html`).
- **`getElementTransform()`**: A utility to synchronize 3D projected coordinates back to the DOM, ensuring hover effects, clicks, and text selection "just work."
- **`onpaint`**: A dedicated event that fires when the browser's rendering of child elements changes, allowing for perfectly synchronized animation loops.

## 🚀 Use Cases
- **3D Interactive Labels**: Overlaying 3D scenes with accessible, multi-language labels (see `webgl_animation_translate.html`).
- **Rich 2D Graphics**: Rendering complex charts, legend systems, and complex typography into high-performance 2D scenes.
- **Compositing & Shaders**: Applying WebGL shaders or CSS filters to live HTML content.

## 🛠️ Setup & Requirements

To view these examples, you must use **Chrome Canary** (v138+) and enable the following flag:
- `chrome://flags/#canvas-draw-element`

## 📖 Basic Implementation Pattern

```html
<canvas id="my-canvas" layoutsubtree>
  <!-- DOM content lives inside, processed by layout engine but not rendered -->
  <div id="ui-overlay">Hello World</div>
</canvas>

<script>
  const canvas = document.getElementById('my-canvas');
  const ctx = canvas.getContext('2d');
  const el = document.getElementById('ui-overlay');

  canvas.onpaint = () => {
    ctx.reset();
    // Draw the HTML element at (100, 100)
    const transform = ctx.drawElementImage(el, 100, 100);
    // Sync DOM for hit-testing
    el.style.transform = transform.toString();
  };
</script>
```

## ⚖️ License

MIT License. See [LICENSE](./LICENSE) for details.
