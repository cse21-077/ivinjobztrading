<<<<<<< HEAD
if(!self.define){let e,s={};const n=(n,i)=>(n=new URL(n+".js",i).href,s[n]||new Promise((s=>{if("document"in self){const e=document.createElement("script");e.src=n,e.onload=s,document.head.appendChild(e)}else e=n,importScripts(n),s()})).then((()=>{let e=s[n];if(!e)throw new Error(`Module ${n} didn’t register its module`);return e})));self.define=(i,a)=>{const c=e||("document"in self?document.currentScript.src:"")||location.href;if(s[c])return;let t={};const r=e=>n(e,c),o={module:{uri:c},exports:t,require:r};s[c]=Promise.all(i.map((e=>o[e]||r(e)))).then((e=>(a(...e),t)))}}define(["./workbox-4d767a27"],(function(e){"use strict";importScripts(),self.skipWaiting(),e.clientsClaim(),e.precacheAndRoute([{url:"/_next/app-build-manifest.json",revision:"752df004130665c0020f5a21fd960322"},{url:"/_next/dynamic-css-manifest.json",revision:"d751713988987e9331980363e24189ce"},{url:"/_next/static/chunks/2e5b0c64-036b73d72516de3c.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/468.03408b0605f02c31.js",revision:"03408b0605f02c31"},{url:"/_next/static/chunks/481-0a008aa67df7735e.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/4bd1b696-f415c57636f68b8b.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/587-e20663423428ed58.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/761.03cd2fc39eb99fa4.js",revision:"03cd2fc39eb99fa4"},{url:"/_next/static/chunks/823-77a97d357b73da15.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/960-7f5fff8217b9d9a2.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/978-4ec9f7c168f3d4c5.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/_not-found/page-dd3e0844563b4160.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/admin-dashboard/page-43d712401a13a857.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/dashboard/page-114e17814024994a.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/layout-ea029d53971a4cae.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/login/page-a6e3b8de65eebcca.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/page-1146bf16469ec0f8.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/signup/layout-94faa4c862553955.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/signup/page-87066ea390b401d1.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/app/waiting-approval/page-57fe4b4a234ee309.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/bc9e92e6-0c0910cc6f618406.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/framework-859199dea06580b0.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/main-608f9d0df4612c6c.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/main-app-4d75c96f8d6adf1b.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/pages/_app-3c23e1c119dc4ed7.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/pages/_error-3ad7b4ca191aa8a7.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/chunks/polyfills-42372ed130431b0a.js",revision:"846118c33b2c0e922d7b3a7676f81f6f"},{url:"/_next/static/chunks/webpack-e8edd492ccc65f5a.js",revision:"xsUEb7E3XY8hBCdVtEXQS"},{url:"/_next/static/css/c89f94b2497da06c.css",revision:"c89f94b2497da06c"},{url:"/_next/static/media/26a46d62cd723877-s.woff2",revision:"befd9c0fdfa3d8a645d5f95717ed6420"},{url:"/_next/static/media/55c55f0601d81cf3-s.woff2",revision:"43828e14271c77b87e3ed582dbff9f74"},{url:"/_next/static/media/581909926a08bbc8-s.woff2",revision:"f0b86e7c24f455280b8df606b89af891"},{url:"/_next/static/media/6d93bde91c0c2823-s.woff2",revision:"621a07228c8ccbfd647918f1021b4868"},{url:"/_next/static/media/97e0cb1ae144a2a9-s.woff2",revision:"e360c61c5bd8d90639fd4503c829c2dc"},{url:"/_next/static/media/a34f9d1faa5f3315-s.p.woff2",revision:"d4fe31e6a2aebc06b8d6e558c9141119"},{url:"/_next/static/media/df0a9ae256c0569c-s.woff2",revision:"d54db44de5ccb18886ece2fda72bdfe0"},{url:"/_next/static/xsUEb7E3XY8hBCdVtEXQS/_buildManifest.js",revision:"58cbd29f5d7d2a6d50c1f511eac700f7"},{url:"/_next/static/xsUEb7E3XY8hBCdVtEXQS/_ssgManifest.js",revision:"b6652df95db52feb4daf4eca35380933"},{url:"/file.svg",revision:"d09f95206c3fa0bb9bd9fefabfd0ea71"},{url:"/globe.svg",revision:"2aaafa6a49b6563925fe440891e32717"},{url:"/icons/icon-128x128.png",revision:"5d6099927684548f1cbe500cc9c70231"},{url:"/icons/icon-144x144.png",revision:"b6b2ecb84a87eb246be4a015878bb314"},{url:"/icons/icon-152x152.png",revision:"1dbd51a6aa18cf9d07b11d592b0f721e"},{url:"/icons/icon-192x192.png",revision:"bb4bc9c3c4c2e4015f629c667fbb73a3"},{url:"/icons/icon-256x256.png",revision:"230e5a8457aeb616da4ebc1028254444"},{url:"/icons/icon-384x384.png",revision:"5b38cd523042d8cd819730a97c3bde56"},{url:"/icons/icon-48x48.png",revision:"d4da15c97f1ed6d6cff51aea09efca29"},{url:"/icons/icon-512x512.png",revision:"76cf48e1cc32ab7c6bb7b43f38cd5d87"},{url:"/icons/icon-72x72.png",revision:"45cb1056cf8ef01708fcb1690e810c92"},{url:"/icons/icon-96x96.png",revision:"8c0ae002a7613e364809f9fad99cd7f4"},{url:"/manifest.json",revision:"492edaaa6e07f22783aa0a19b9fa5c0e"},{url:"/next.svg",revision:"8e061864f388b47f33a1c3780831193e"},{url:"/vercel.svg",revision:"c0af2f507b369b085b35ef4bbe3bcf1e"},{url:"/window.svg",revision:"a2760511c65806022ad20adf74370ff3"}],{ignoreURLParametersMatching:[]}),e.cleanupOutdatedCaches(),e.registerRoute("/",new e.NetworkFirst({cacheName:"start-url",plugins:[{cacheWillUpdate:async({request:e,response:s,event:n,state:i})=>s&&"opaqueredirect"===s.type?new Response(s.body,{status:200,statusText:"OK",headers:s.headers}):s}]}),"GET"),e.registerRoute(/^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,new e.CacheFirst({cacheName:"google-fonts-webfonts",plugins:[new e.ExpirationPlugin({maxEntries:4,maxAgeSeconds:31536e3})]}),"GET"),e.registerRoute(/^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,new e.StaleWhileRevalidate({cacheName:"google-fonts-stylesheets",plugins:[new e.ExpirationPlugin({maxEntries:4,maxAgeSeconds:604800})]}),"GET"),e.registerRoute(/\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,new e.StaleWhileRevalidate({cacheName:"static-font-assets",plugins:[new e.ExpirationPlugin({maxEntries:4,maxAgeSeconds:604800})]}),"GET"),e.registerRoute(/\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,new e.StaleWhileRevalidate({cacheName:"static-image-assets",plugins:[new e.ExpirationPlugin({maxEntries:64,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\/_next\/image\?url=.+$/i,new e.StaleWhileRevalidate({cacheName:"next-image",plugins:[new e.ExpirationPlugin({maxEntries:64,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\.(?:mp3|wav|ogg)$/i,new e.CacheFirst({cacheName:"static-audio-assets",plugins:[new e.RangeRequestsPlugin,new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\.(?:mp4)$/i,new e.CacheFirst({cacheName:"static-video-assets",plugins:[new e.RangeRequestsPlugin,new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\.(?:js)$/i,new e.StaleWhileRevalidate({cacheName:"static-js-assets",plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\.(?:css|less)$/i,new e.StaleWhileRevalidate({cacheName:"static-style-assets",plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\/_next\/data\/.+\/.+\.json$/i,new e.StaleWhileRevalidate({cacheName:"next-data",plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute(/\.(?:json|xml|csv)$/i,new e.NetworkFirst({cacheName:"static-data-assets",plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute((({url:e})=>{if(!(self.origin===e.origin))return!1;const s=e.pathname;return!s.startsWith("/api/auth/")&&!!s.startsWith("/api/")}),new e.NetworkFirst({cacheName:"apis",networkTimeoutSeconds:10,plugins:[new e.ExpirationPlugin({maxEntries:16,maxAgeSeconds:86400})]}),"GET"),e.registerRoute((({url:e})=>{if(!(self.origin===e.origin))return!1;return!e.pathname.startsWith("/api/")}),new e.NetworkFirst({cacheName:"others",networkTimeoutSeconds:10,plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:86400})]}),"GET"),e.registerRoute((({url:e})=>!(self.origin===e.origin)),new e.NetworkFirst({cacheName:"cross-origin",networkTimeoutSeconds:10,plugins:[new e.ExpirationPlugin({maxEntries:32,maxAgeSeconds:3600})]}),"GET")}));
=======
const CACHE_NAME = "trading-dashboard-cache-v1"
const urlsToCache = ["/", "/login", "/signup", "/dashboard", "/waiting-approval", "/admin-dashboard"]

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)))
})

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response
      }
      return fetch(event.request)
    }),
  )
})

self.addEventListener("activate", (event) => {
  const cacheWhitelist = [CACHE_NAME]
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName)
          }
        }),
      )
    }),
  )
})

>>>>>>> parent of abe4317 (Error fix)
