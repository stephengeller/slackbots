const axios = require("axios");
require("dotenv").config();
const {
  INSTANCE_IP,
  SERVER_INSTANCE_ID,
  TOPIC_URL,
  MCAPIURL,
  ENV,
  MINECRAFT_SLACK_CHANNEL
} = process.env;
const mcApiUrl = MCAPIURL + INSTANCE_IP;
let AWS, ec2;

if (ENV !== "dev") {
  AWS = require("aws-sdk");
  AWS.config.update({ region: "eu-west-2" });
  ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
}

const abortStopText =
  "*Stop aborted*\n" +
  "Please log into the server and run `/stop` to shut down the server, " +
  "then run `/minecraft stop` again.";

const minecraftChannel = MINECRAFT_SLACK_CHANNEL;
const ec2Params = {
  DryRun: false,
  InstanceIds: [SERVER_INSTANCE_ID]
};

const jsonResponse = (
  channel = null,
  text,
  response_type = "ephemeral",
  attachments = null
) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      channel,
      text,
      response_type,
      attachments
    })
  };
};

const jsonBlockResponse = (channel, blocks, response_type = "ephemeral") => {
  return {
    statusCode: 200,
    body: JSON.stringify({ channel, blocks, response_type })
  };
};

const turnOnServer = async user => {
  const { state } = await getEC2State();
  if (state === "stopped") {
    await ec2
      .startInstances(ec2Params)
      .promise(res => res)
      .catch(err => err);
    return {
      text: `<@${user}> turned on the server!`,
      response_type: "in_channel"
    };
  } else {
    return {
      text: generateHelpMsg(state),
      response_type: "ephemeral"
    };
  }
};

const stopConfirm = user => {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<@${user}>, have you gracefully stopped the server with \`/stop\`?*`
      }
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", emoji: true, text: "Yes" },
          style: "primary",
          value: "yes"
        },
        {
          type: "button",
          text: { type: "plain_text", emoji: true, text: "No" },
          style: "danger",
          value: "no"
        }
      ]
    }
  ];
};

const stopEC2Server = async user => {
  await ec2
    .stopInstances(ec2Params)
    .promise()
    .catch(err => err);
  axios.get(TOPIC_URL).catch(err => {
    throw err;
  });
  return `<@${user}> is stopping the server!`;
};

function generateHelpMsg(state) {
  return `Server is *${state}*\nCheck \`/minecraft status\`.`;
}

const promptStopConfirmation = async user => {
  const { state } = await getEC2State();
  if (state === "stopped" || state === "stopping") {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: generateHelpMsg(state)
        }
      }
    ];
  } else {
    return stopConfirm(user);
  }
};

const getEC2State = async () => {
  return await ec2
    .describeInstances(ec2Params)
    .promise()
    .then(data => {
      const serverInfo = data.Reservations[0].Instances[0];
      const { State, LaunchTime } = serverInfo;
      const state = State.Name;
      return {
        message: `The EC2 instance is *${state}*\nLast launched at ${LaunchTime}`,
        state
      };
    })
    .catch(err => console.log(err));
};

const assertServerState = ({ players, online }, { state, message }) => {
  if (online) {
    return (
      "\nServer is *online*!\n" + `*${players.now} players* currently online.\n`
    );
  } else {
    return (
      `\nEC2 instance is *${state}* but *Minecraft server is not running*.\nWait for a few seconds if just turning it on, then speak to Stephen?\n` +
      message
    );
  }
};

const serverStatus = async () => {
  const ec2Info = await getEC2State();

  if (ec2Info.state !== "running") {
    return (
      "EC2 instance is " +
      ec2Info.state +
      ". Run `/minecraft on` to turn it on.\n"
    );
  }

  return await axios.get(mcApiUrl).then(res => {
    const { data } = res;
    return assertServerState(data, ec2Info);
  });
};

const logAxiosErr = err => {
  console.log("axios err:");
  console.log(err);
};

const axiosResponse = async (responseURL, params) => {
  return await axios.post(responseURL, params).catch(err => {
    logAxiosErr(err);
    throw err;
  });
};

const handlePayload = async parsed => {
  try {
    let params;
    const payload = JSON.parse(parsed.get("payload"));
    const { response_url, user, actions } = payload;
    const { value } = actions[0];

    if (value === "yes") {
      params = {
        text: await fns.stopEC2Server(user.id),
        response_type: "in_channel"
      };
    } else if (value === "no") {
      params = {
        text: abortStopText,
        response_type: "ephemeral"
      };
    } else {
      params = {
        text: "*Action not understood :(*",
        response_type: "ephemeral"
      };
    }

    return await fns.axiosResponse(response_url, params);
  } catch (e) {
    throw e;
  }
};

const handler = async event => {
  if (!event["body"]) {
    throw new Error("No body in event");
  }

  try {
    const parsed = new URLSearchParams(event.body);
    if (parsed.get("payload") != null) {
      return await fns.handlePayload(parsed);
    }

    const [req_channel, user_id, command, text] = [
      parsed.get("channel_id"),
      parsed.get("user_id"),
      parsed.get("command"),
      parsed.get("text")
    ];

    if (command === "/minecraft") {
      if (text === "on" || text === "start") {
        const { text, response_type } = await fns.turnOnServer(user_id);
        console.log(text, response_type);
        return fns.jsonResponse(minecraftChannel, text, response_type);
      } else if (text === "off" || text === "stop") {
        const blocks = await fns.promptStopConfirmation(user_id);
        return fns.jsonBlockResponse(minecraftChannel, blocks);
      } else if (text === "status") {
        const msg = await fns.serverStatus();
        return fns.jsonResponse(req_channel, msg, "ephemeral");
      } else {
        return fns.jsonResponse(
          null,
          "Incorrect arg, try `/minecraft on|off|status`",
          "ephemeral"
        );
      }
    } else {
      return fns.jsonResponse(
        null,
        "Error: Slash command not recognised.",
        "ephemeral"
      );
    }
  } catch (e) {
    const msg = e.toString();
    console.log(msg);
    return fns.jsonResponse(null, msg, "ephemeral");
  }
};

const fns = {
  handler,
  jsonResponse,
  jsonBlockResponse,
  assertServerState,
  handlePayload,
  abortStopText,
  axiosResponse,
  stopEC2Server,
  turnOnServer,
  minecraftChannel,
  promptStopConfirmation,
  serverStatus
};

module.exports = fns;
