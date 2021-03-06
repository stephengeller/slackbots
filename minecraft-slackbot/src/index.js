const axios = require("axios");
require("dotenv").config();
const {
  INSTANCE_IP,
  SERVER_INSTANCE_ID,
  TOPIC_URL,
  MCAPI_URL,
  MINECRAFT_SLACK_CHANNEL,
  NODE_ENV
} = process.env;
const mcApiUrl = MCAPI_URL + INSTANCE_IP;
let AWS, ec2;

if (NODE_ENV !== "test") {
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
      .catch(err => {
        throw err;
      });
    return {
      text: `<@${user}> turned on the server!`,
      response_type: "in_channel"
    };
  } else {
    return {
      text: badStateMsg(state),
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

const handleStop = async (user_id, channel) => {
  // const ec2State = getEC2State();
  const blocks = await fns.promptStopConfirmation(user_id);
  return fns.jsonBlockResponse(channel, blocks, "in_channel");
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

function badStateMsg(state) {
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
          text: badStateMsg(state)
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

const assertServerState = (players, online, state) => {
  if (online) {
    return {
      state: "running",
      message:
        "\nServer is *online*!\n" + `*${players} players* currently online.\n`,
      players
    };
  } else {
    return {
      state: "running",
      message: `\nEC2 instance is *${state}* but *Minecraft server is not running*.\nWait for a few seconds if just turning it on, then speak to Stephen?\n`,
      players
    };
  }
};

const serverStatus = async () => {
  const ec2Info = await getEC2State();

  if (ec2Info.state !== "running") {
    return {
      state: ec2Info.state,
      message:
        "EC2 instance is " +
        ec2Info.state +
        ". Run `/minecraft on` to turn it on.\n",
      players: 0
    };
  }

  return await axios
    .get(mcApiUrl)
    .then(res => {
      const { data } = res;
      const { players, online } = data;
      return assertServerState(players.now, online, ec2Info.state);
    })
    .catch(err => {
      throw err;
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
        return fns.jsonResponse(null, text, response_type);
      } else if (text === "off" || text === "stop") {
        return await fns.handleStop(user_id, minecraftChannel);
      } else if (text === "status") {
        const { message } = await fns.serverStatus();
        return fns.jsonResponse(req_channel, message, "ephemeral");
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
    console.log(e);
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
  serverStatus,
  handleStop
};

module.exports = fns;
