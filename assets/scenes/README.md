# Local scene photographs

These are the same photographs already used by the timer, now served from the
application's origin so the WebGL weather layers can sample their lighting and
align their masks without cross-origin texture dependencies.

- `cabin.jpg`: Gadiel Lazcano, Unsplash photo `1772955543023-a6e99819e161`.
  Source: https://images.unsplash.com/photo-1772955543023-a6e99819e161?fit=crop&w=1440&q=85&fm=jpg
- `mountain.jpg`: ki Zhang, Unsplash photo `1772089003225-6eccf98ddbf9`.
  Source: https://images.unsplash.com/photo-1772089003225-6eccf98ddbf9?fit=crop&w=1920&q=85&fm=jpg

The original aspect ratio is preserved. Weather masks are defined in normalized
source-photo coordinates and use the same centered cover mapping as the DOM.
