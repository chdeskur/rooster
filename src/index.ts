import { App } from "@slack/bolt";
import cron from "node-cron";
import { config } from "./config";
import {
  getUnrespondedThreadsMessage,
  sendOpenThreadReminder,
  sendUnrespondedThreadsReminder,
} from "./openThreadReminder";

const app = new App({
  token: config.slack.botToken,
  signingSecret: config.slack.signingSecret,
  socketMode: true,
  appToken: config.slack.appToken,
});

// schedule the open thread reminder for 5 PM on weekdays
cron.schedule("0 17 * * 1-5", async () => {
  console.log("running end-of-day open thread check...");
  try {
    await sendOpenThreadReminder(app);
  } catch (error) {
    console.error("error sending open thread reminder:", error);
  }
});

// health check command
app.command("/rooster-status", async ({ ack, respond }) => {
  await ack();
  await respond("🐓 rooster is alive and watching for open threads!");
});

// manual trigger for checking unresponded threads from today
// use --channel to send to #customer-alerts, otherwise ephemeral
// use --remind to tag on-call engineers (implies --channel)
app.command("/rooster-check", async ({ ack, respond, command }) => {
  await ack();
  const tagOncall = command.text?.includes("--remind");
  const sendToChannel = tagOncall || command.text?.includes("--channel");

  await respond("🐓 checking unresponded threads from today...");
  try {
    if (sendToChannel) {
      const sent = await sendUnrespondedThreadsReminder(app, tagOncall);
      if (!sent) {
        await respond("✅ no unresponded threads found!");
      }
    } else {
      const message = await getUnrespondedThreadsMessage();
      if (message) {
        await respond(message);
      } else {
        await respond("✅ no unresponded threads found!");
      }
    }
  } catch (error) {
    console.error("error during manual check:", error);
    await respond("❌ error running the check. see logs for details.");
  }
});

(async () => {
  await app.start();
  console.log("🐓 rooster is running!");
  console.log("scheduled: open thread reminder at 5 PM on weekdays");
})();
