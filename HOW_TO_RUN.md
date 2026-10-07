# How to Run Stock Face-Off (plain-language guide)

This is a step-by-step guide to opening your app yourself, written so you can
follow it without any help. You only need to do this when you want to use the
app — nothing runs on its own.

---

## The one-time idea to understand

Your app has **two parts** that both need to be running at the same time:

1. A **backend** (the part that fetches stock prices and inflation data)
2. A **frontend** (the web page you actually look at in your browser)

There's a single file, `run.sh`, that starts **both** of them for you with one
command. You don't need to understand what it does — just run it.

While the app is running, you keep a Terminal window open. When you're done,
you close it. That's the whole routine.

---

## Starting the app (do this every time you want to use it)

### Step 1 — Open the Terminal app

- Press **Cmd + Space** (this opens Mac's search bar)
- Type **Terminal**
- Press **Enter**

A window with text and a blinking cursor opens. This is the Terminal.

### Step 2 — Start the app

Copy the line below, paste it into the Terminal, and press **Enter**:

```bash
cd "/Users/mikedomm/Desktop/Personal Life/Stocks" && ./run.sh
```

You'll see some messages scroll by (it's setting things up and starting the
servers). The **first time** can take a minute. When it's ready, it will say
something like:

```
==> Open http://127.0.0.1:8000 in your browser (Ctrl+C to stop)
```

**Leave this Terminal window open.** If you close it, the app stops.

### Step 3 — Open the app in your browser

Open **Safari**, click the address bar at the top, type one of these, and press
Enter:

- Compare two stocks: **http://127.0.0.1:8000**
- Beat Inflation page: **http://127.0.0.1:8000/inflation.html**

(You can also just click the links at the top of the page to move between them.)

> **First load is slow.** The very first chart can take 30–60 seconds to appear
> because it's downloading the data. The page will say "Loading…". This is
> normal. After the first load, everything is fast.

---

## Stopping the app (when you're done)

1. Click on the Terminal window
2. Press **Ctrl + C** (hold Control, press C)

That stops both parts. You can now close the Terminal window.

---

## If something doesn't work

**The page won't load / says it can't connect**
- Make sure the Terminal window from Step 2 is still open and running.
- If you closed it, just do Steps 1–3 again.

**The chart is blank or shows an error**
- Refresh the page in Safari: **Cmd + R**
- If it still won't work, stop the app (Ctrl + C in Terminal) and start it again.

**"command not found" or similar in the Terminal**
- Double-check you pasted the Step 2 line exactly, including the quotation marks.

---

## What the web addresses mean (just so they're not a mystery)

- `127.0.0.1` means "this computer." The app runs **on your Mac**, not on the
  internet, so only you can see it while it's running.
- `:8000` and `:5000` are "ports" — think of them as two different doors on your
  computer, one for the web page and one for the data behind it.

---

## Putting changes online (GitHub)

Your project also lives on GitHub at
<https://github.com/mrdomm/Stock-face-off>. When you've made changes you want to
save online, open a Terminal in the project folder and run these three lines:

```bash
git add -A
git commit -m "describe what you changed"
git push
```

That uploads your latest version. (It may not ask for a password since your Mac
remembered it last time.)
