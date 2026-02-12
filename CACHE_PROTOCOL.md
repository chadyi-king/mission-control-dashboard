# CACHE BUSTING PROTOCOL

## **THE RULE**

Every time you edit a file that browsers cache, YOU MUST bump the version number.

## **Files That Need Version Bumping**

| File | Current Version | Bump When |
|------|-----------------|-----------|
| `project-tasks-modal.css` | v9 | Any CSS changes |
| `project-tasks-modal.js` | v10 | Any JS changes |
| `data.json` | N/A | Use `?t=Date.now()` |

## **How to Bump**

### CSS Example:
```html
<!-- Before -->
<link rel="stylesheet" href="project-tasks-modal.css?v=9">

<!-- After (you edited the CSS) -->
<link rel="stylesheet" href="project-tasks-modal.css?v=10">
```

### JS Example:
```html
<!-- Before -->
<script src="project-tasks-modal.js?v=10"></script>

<!-- After (you edited the JS) -->
<script src="project-tasks-modal.js?v=11"></script>
```

### Data Example:
```javascript
// Always use cache buster for data.json
fetch('data.json?t=' + Date.now())
```

## **The Checklist**

Before committing ANY change:

- [ ] Did I edit CSS? → Bump CSS version
- [ ] Did I edit JS? → Bump JS version  
- [ ] Did I edit data.json? → Already has timestamp cache busting
- [ ] Test in incognito/private window

## **Why This Matters**

Without cache busting:
- Browser uses OLD files
- New code doesn't run
- Data appears "broken"
- You think tasks are gone

With cache busting:
- Browser downloads NEW files
- New code runs
- Data displays correctly
- Everything works

## **Emergency Fix**

If dashboard looks broken after deploy:
1. Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Or clear browser cache completely
3. Or open in incognito window
