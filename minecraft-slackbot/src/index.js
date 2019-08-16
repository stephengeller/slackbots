const AWS = require("aws-sdk");
const axios = require("axios");
require("dotenv").config();

AWS.config.update({ region: "eu-west-2" });

// const stephenID = "ULQRZJEK1";
const minecraftChannel = "CLBLVNLE7";
const { INSTANCE_IP, SERVER_INSTANCE_ID } = process.env;
const ec2 = new AWS.EC2({ apiVersion: "2016-11-15" });
const params = {
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

// function userIsValid(user) {
//   return user === stephenID;
// }

const turnOnServer = async user => {
  const { state } = await getEC2State();
  if (state === "stopped") {
    await ec2
      .startInstances(params)
      .promise()
      .catch(err => err);
    return `<@${user}> turned on the server!`;
  } else {
    return "Server state is *" + state + "*\nCheck `/minecraft status`.";
  }
};

function promptStopConfirmation(user) {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*<@${user}>, have you shut down the server with \`/stop\`?*`
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

const turnOffServer = async user => {
  const { state } = await getEC2State();
  if (state === "stopped" || state === "stopping") {
    return "Server is *off*\nCheck `/minecraft status`.";
  } else {
    return promptStopConfirmation(user);

    // await ec2
    //   .stopInstances(params)
    //   .promise()
    //   .catch(err => err);
    // return `<@${user}> is stopping the server!`;
  }
};

async function getEC2State() {
  return await ec2
    .describeInstances(params)
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

const serverStatus = async () => {
  const ec2Info = await getEC2State();

  if (ec2Info.state !== "running") {
    return (
      "EC2 instance is " +
      ec2Info.state +
      ". Run `/minecraft on` to turn it on.\n"
    );
  }

  const url = "https://mcapi.us/server/status?port=25565&ip=" + INSTANCE_IP;
  return await axios.get(url).then(res => {
    let formattedStr;
    const { data } = res;
    if (data.online) {
      formattedStr = "\nServer is *online*!\n";
      formattedStr += `*${data.players.now} players* currently online.\n`;
      return formattedStr;
    } else {
      return (
        `\nEC2 instance is ${
          ec2Info.state
        } but *Minecraft server is not running*.\nWait for a few seconds if just turning it on, then speak to Stephen?\n` +
        ec2Info.message
      );
    }
  });
};

const handler = async event => {
  let msg = "Incorrect arg, try `/minecraft on|off|status`";
  msg = JSON.stringify(event);

  try {
    const { body } = event;
    const parsed = new URLSearchParams(body);
    const req_channel = parsed.get("channel_id");
    const user_id = parsed.get("user_id");
    const command = parsed.get("command");
    const text = parsed.get("text");
    if (command === "/minecraft") {
      if (text === "on" || text === "start") {
        msg = await turnOnServer(user_id);
      } else if (text === "off" || text === "stop") {
        const blocks = await turnOffServer(user_id);
        return jsonBlockResponse(minecraftChannel, blocks);
      } else if (text === "status") {
        msg = await serverStatus();
        return jsonResponse(req_channel, msg, "ephemeral");
      }
    }
    return jsonResponse(minecraftChannel, msg, "in_channel");
  } catch (e) {
    msg = "ERROR: " + e.toString();
    console.log(msg);
    console.log(event);
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
