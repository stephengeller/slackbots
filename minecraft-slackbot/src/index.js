const AWS = require("aws-sdk");
const axios = require("axios");
require("dotenv").config();
const { INSTANCE_IP, SERVER_INSTANCE_ID } = process.env;
const mcApiUrl = "https://mcapi.us/server/status?port=25565&ip=" + INSTANCE_IP;

AWS.config.update({ region: "eu-west-2" });

const abortStopText =
  "*Stop aborted*\n" +
  "Please log into the server and run `/stop` to shut down the server, " +
  "then run `/minecraft stop` again.";

const minecraftChannel = "CLBLVNLE7";
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const ec2Params = {
  DryRun: false,
  InstanceIds: [SERVER_INSTANCE_ID]
};

const jsonResponse = (
  channel = null,
  text,
  response_type = "in_channel",
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

const jsonBlockResponse = (channel, blocks, response_type = "in_channel") => {
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
      .promise()
      .catch(err => err);
    return `<@${user}> turned on the server!`;
  } else {
    return "Server state is *" + state + "*\nCheck `/minecraft status`.";
  }
};

function stopConfirm(user) {
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
}

const stopEC2Server = async user => {
  await ec2
    .stopInstances(ec2Params)
    .promise()
    .catch(err => err);
  return `<@${user}> is stopping the server!`;
};

const promptStopConfirmation = async user => {
  const { state } = await getEC2State();
  if (state === "stopped" || state === "stopping") {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Server is *off*\nCheck `/minecraft status`."
        }
      }
    ];
  } else {
    return stopConfirm(user);
  }
};

async function getEC2State() {
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
}

function assertServerState(data, ec2Info) {
  if (data.online) {
    return (
      "\nServer is *online*!\n" +
      `*${data.players.now} players* currently online.\n`
    );
  } else {
    return (
      `\nEC2 instance is *${
        ec2Info.state
      }* but *Minecraft server is not running*.\nWait for a few seconds if just turning it on, then speak to Stephen?\n` +
      ec2Info.message
    );
  }
}

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

const axiosResponse = async (response_url, params) => {
  return await axios.post(response_url, params).catch(err => {
    logAxiosErr(err);
    throw err;
  });
};

async function handlePayload(parsed) {
  let params;
  const payload = JSON.parse(parsed.get("payload"));
  const { response_url, user, actions } = payload;
  const { value } = actions[0];

  if (value === "yes") {
    params = {
      text: await stopEC2Server(user.id),
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
  return await axiosResponse(response_url, params);
}

const handler = async event => {
  let msg = "Incorrect arg, try `/minecraft on|off|status`";

  try {
    const parsed = new URLSearchParams(event.body);
    if (parsed.get("payload") != null) {
      return await handlePayload(parsed, event);
    }

    const [req_channel, user_id, command, text] = [
      parsed.get("channel_id"),
      parsed.get("user_id"),
      parsed.get("command"),
      parsed.get("text")
    ];

    if (command === "/minecraft") {
      if (text === "on" || text === "start") {
        msg = await turnOnServer(user_id);
        return jsonResponse(minecraftChannel, msg, "ephemeral");
      } else if (text === "off" || text === "stop") {
        const blocks = await promptStopConfirmation(user_id);
        return jsonBlockResponse(minecraftChannel, blocks);
      } else if (text === "status") {
        msg = await serverStatus();
        return jsonResponse(req_channel, msg, "ephemeral");
      }
    }
  } catch (e) {
    msg = "ERROR: " + e.toString();
    console.log(msg);
    return {
      statusCode: 200,
      body: JSON.stringify({
        text: msg,
        response_type: "ephemeral"
      })
    };
  }
};

module.exports = { handler };
