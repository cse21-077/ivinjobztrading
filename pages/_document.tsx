import Document, { Html, Head, Main, NextScript } from "next/document"

class MyDocument extends Document {
  render() {
    return (
      <Html lang="en">
        <Head>
          <link rel="manifest" href="/manifest.json" />
          <meta name="theme-color" content="#3b82f6" />
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}

export default MyDocument

