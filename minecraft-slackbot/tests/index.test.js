const index = require("../src/index");
const axios = require("axios");
jest.mock("axios");

const {
  jsonResponse,
  jsonBlockResponse,
  assertServerState,
  abortStopText,
  handler
} = index;

describe("index", () => {
  describe("jsonResponse", () => {
    test("works without attachments", () => {
      const res = jsonResponse("chan", "text", "ephemeral");
      expect(res).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          channel: "chan",
          text: "text",
          response_type: "ephemeral",
          attachments: null
        })
      });
    });

    test("works with attachments", () => {
      const res = jsonResponse("chan", "text", "ephemeral", [1, 2, 3]);
      expect(res).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          channel: "chan",
          text: "text",
          response_type: "ephemeral",
          attachments: [1, 2, 3]
        })
      });
    });
  });
  describe("axiosResponse", () => {
    test("Makes post request via axios", async () => {
      axios.post.mockResolvedValue("bar");

      const respURL = "www.foo.com";
      const params = { foo: "bar" };

      index.axiosResponse(respURL, params);

      expect(axios.post).toHaveBeenCalledWith(respURL, params);
    });

    test("Throws err if axios err", async () => {
      axios.post.mockImplementationOnce(() => {
        throw new Error("BROKE");
      });
      const respURL = "www.foo.com";
      const params = { foo: "bar" };
      await index
        .axiosResponse(respURL, params)
        .catch(err => expect(err.toString()).toEqual("Error: BROKE"));

      expect(axios.post).toHaveBeenCalledWith(respURL, params);
    });
  });

  describe("jsonBlockResponse", () => {
    test("renders JSON body with blocks array", () => {
      const res = jsonBlockResponse("chan", ["block1", "block2"], "ephemeral");
      expect(res).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          channel: "chan",
          blocks: ["block1", "block2"],
          response_type: "ephemeral"
        })
      });
    });
  });

  describe("assertServerState", () => {
    test("returns message if server is online", () => {
      const res = assertServerState(
        { players: { now: 1 }, online: true },
        { state: "running", message: "foo" }
      );
      const expectedMsg =
        "\nServer is *online*!\n*1 players* currently online.\n";

      expect(res).toEqual(expectedMsg);
    });

    test("returns message if server is offline but ec2 online", () => {
      const res = assertServerState(
        { online: false },
        { state: "running", message: "foo" }
      );
      const expectedMsg =
        "\nEC2 instance is *running* but *Minecraft server is not running*.\n" +
        "Wait for a few seconds if just turning it on, then speak to Stephen?\nfoo";
      expect(res).toEqual(expectedMsg);
    });
  });
  describe("handlePayload", () => {
    beforeEach(() => {
      index.axiosResponse = jest.fn();
      index.stopEC2Server = jest.fn(id => `${id} stopped server`);
    });

    test("returns success message if value is yes", async () => {
      let parsed = {
        get: jest.fn(() => {
          return JSON.stringify({
            response_url: "foo",
            user: { id: "someID" },
            actions: [{ value: "yes" }]
          });
        })
      };

      await index.handlePayload(parsed);
      expect(index.stopEC2Server).toHaveBeenCalledWith("someID");
      expect(index.axiosResponse).toHaveBeenCalledWith("foo", {
        text: "someID stopped server",
        response_type: "in_channel"
      });
    });

    test("returns abort message if value is no", async () => {
      let parsed = {
        get: jest.fn(() => {
          return JSON.stringify({
            response_url: "foo",
            user: "bar",
            actions: [{ value: "no" }]
          });
        })
      };

      await index.handlePayload(parsed);
      expect(index.axiosResponse).toHaveBeenCalledWith("foo", {
        text: abortStopText,
        response_type: "ephemeral"
      });
    });

    test("returns helpful message if value is not defined", async () => {
      let parsed = {
        get: jest.fn(() => {
          return JSON.stringify({
            response_url: "foo",
            user: "bar",
            actions: [{ value: "something random" }]
          });
        })
      };
      index.axiosResponse = jest.fn();

      await index.handlePayload(parsed);
      expect(index.axiosResponse).toHaveBeenCalledWith("foo", {
        text: "*Action not understood :(*",
        response_type: "ephemeral"
      });
    });
    test("throws error if errored!", async () => {
      let parsed = {
        get: jest.fn(() => {
          throw new Error("Error getting parsed val");
        })
      };

      try {
        await index.handlePayload(parsed);
      } catch (err) {
        expect(err.toString()).toEqual("Error: Error getting parsed val");
      }
    });
  });

  describe("handler", () => {
    beforeEach(() => {});

    test("throws err if no body in received event", async () => {
      try {
        await handler({ lol: "not a valid event" });
      } catch (e) {
        expect(e.toString()).toEqual("Error: No body in event");
      }
    });

    test("returns error response if error in try block", async () => {
      let outputData = "";
      index.turnOnServer = jest.fn(() => {
        throw new Error("Error turning on server");
      });
      const body =
        "channel_id=chan&user_id=some_user&command=%2Fminecraft&text=on";

      console["log"] = jest.fn(out => (outputData += out));

      const res = await handler({ body });
      expect(JSON.parse(res.body)).toEqual({
        text: "Error: Error turning on server",
        response_type: "ephemeral",
        attachments: null,
        channel: null
      });
      expect(outputData).toContain("Error: Error turning on server");
    });

    test("returns success ON response if turning on", async () => {
      index.turnOnServer = jest.fn(id => {
        return { text: `${id} turned on server`, response_type: "ephemeral" };
      });
      const body =
        "channel_id=chan&user_id=some_user&command=%2Fminecraft&text=on";
      const res = await handler({ body });
      expect(JSON.parse(res.body)).toEqual({
        text: "some_user turned on server",
        response_type: "ephemeral",
        attachments: null,
        channel: index.minecraftChannel
      });
    });

    test("returns success promptStopConfirmation response if turning off", async () => {
      index.promptStopConfirmation = jest.fn(id => `${id} turned off server`);
      const body =
        "channel_id=chan&user_id=some_user&command=%2Fminecraft&text=off";
      const res = await handler({ body });
      expect(JSON.parse(res.body)).toEqual({
        blocks: "some_user turned off server",
        response_type: "in_channel",
        channel: index.minecraftChannel
      });
    });

    test("returns success status response if turning off", async () => {
      index.serverStatus = jest.fn(() => "IT BE RUNNING");
      const body =
        "channel_id=chan&user_id=some_user&command=%2Fminecraft&text=status";
      const res = await handler({ body });
      expect(JSON.parse(res.body)).toEqual({
        text: "IT BE RUNNING",
        response_type: "ephemeral",
        channel: "chan",
        attachments: null
      });
    });

    test("returns success status response if turning off", async () => {
      index.serverStatus = jest.fn(() => "IT BE RUNNING");
      const body =
        "channel_id=chan&user_id=some_user&command=%2Fminecraft&text=somethinginvalid";
      const res = await handler({ body });
      expect(JSON.parse(res.body)).toEqual({
        text: "Incorrect arg, try `/minecraft on|off|status`",
        response_type: "ephemeral",
        channel: null,
        attachments: null
      });
    });

    test("returns error object if bad command", async () => {
      const res = await handler({ body: "not a valid event" });
      expect(JSON.parse(res.body)).toEqual({
        text: "Error: Slash command not recognised.",
        response_type: "ephemeral",
        channel: null,
        attachments: null
      });
    });

    describe("payload", function() {
      test("calls handlePayload", async () => {
        index.handlePayload = jest.fn(parsed => parsed.get("payload"));
        const body = "payload=blah";
        const res = await handler({ body });
        expect(index.handlePayload).toHaveBeenCalledWith(
          new URLSearchParams(body)
        );
        expect(res).toEqual("blah");
      });
    });
  });
});
