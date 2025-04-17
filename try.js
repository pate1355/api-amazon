const express = require("express");
const puppeteer = require("puppeteer");
const nodemailer = require("nodemailer");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const locationArr = [
  "Barrhaven, ON",
  "Ajax, ON",
  "Scarborough, ON",
  "Brampton, ON",
  "Etobicoke, ON",
  "Toronto, ON",
  "Mississauga, ON",
  "Bolton, ON",
  "Hamilton, ON",
  "Oakville, ON",
  "Milton, ON",
  "Cambridge, ON",
  "Kitchener, ON",
  "Windsor, ON",
  "Ottawa, ON",
  "Brantford, ON",
];

const jobSearchURL = "https://hiring.amazon.ca/app#/jobSearch";

// Email setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SENDER_EMAIL,
    pass: process.env.SENDER_PASSWORD,
  },
});

async function sendEmail(subject, htmlText) {
  try {
    await transporter.sendMail({
      from: process.env.SENDER_EMAIL,
      to: process.env.RECEIVER_EMAIL,
      subject,
      html: htmlText,
    });
    console.log("📧 Email sent!");
  } catch (error) {
    console.error("❌ Email error:", error);
  }
}

async function launchBrowser() {
  return await puppeteer.launch({
    executablePath:
      process.env.NODE_ENV === "production"
        ? process.env.PUPPETEER_EXECUTABLE_PATH
        : puppeteer.executablePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

async function searchJobs(page) {
  console.log("🔍 Navigating to Amazon jobs page...");
  await page.goto(jobSearchURL, {
    waitUntil: "domcontentloaded",
    timeout: 6000,
  });

  try {
    await page.evaluate(() => {
      const expandLink = document.querySelector(
        '[data-test-id="expand-your-search-link"]'
      );
      if (expandLink) expandLink.click();
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const jobCards = await page.$$('.jobCardItem[role="link"]');
    const jobs = [];

    for (let jobCard of jobCards) {
      const jobDetails = await jobCard.evaluate((card) => {
        const title =
          card.querySelector(".jobDetailText strong")?.textContent?.trim() ||
          null;

        const typeText =
          [...card.querySelectorAll(".jobDetailText")].find((el) =>
            el.textContent.includes("Type:")
          )?.textContent || "";
        const type = typeText.replace("Type:", "").trim();

        const durationText =
          [...card.querySelectorAll(".jobDetailText")].find((el) =>
            el.textContent.includes("Duration:")
          )?.textContent || "";
        const duration = durationText.replace("Duration:", "").trim();

        const payRateText =
          [...card.querySelectorAll(".jobDetailText")].find((el) =>
            el.textContent.includes("Pay rate:")
          )?.textContent || "";
        const payRate = payRateText.replace("Pay rate:", "").trim();

        const locationEl = [
          ...card.querySelectorAll(".hvh-careers-emotion-nfxjpm"),
        ].find(
          (el) =>
            el.textContent &&
            /^[A-Za-z\s]+,\s*[A-Z]{2}$/.test(el.textContent.trim())
        );
        const location = locationEl?.textContent?.trim() || null;

        return { title, type, duration, payRate, location };
      });

      jobs.push(jobDetails);

      if (
        jobDetails.location &&
        locationArr.some((loc) => jobDetails.location.includes(loc))
      ) {
        const timestamp = new Date().toLocaleString();
        fs.writeFileSync("jobs.json", JSON.stringify(jobs, null, 2));
        await sendEmail(
          `Amazon Job Found: ${jobDetails.title}`,
          `<strong>Job Details (found on ${timestamp}):</strong><pre>${JSON.stringify(
            jobDetails,
            null,
            2
          )}</pre>`
        );
        return true;
      }
    }
  } catch (err) {
    console.error("❌ Error in job search:", err);
  }

  return false;
}

// Webhook endpoint to trigger job check
app.post("/check-jobs", async (req, res) => {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  const jobFound = await searchJobs(page);

  await browser.close();

  if (jobFound) {
    res.status(200).json({ message: "✅ Job found and email sent!" });
  } else {
    res.status(200).json({ message: "❌ No job found." });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});
