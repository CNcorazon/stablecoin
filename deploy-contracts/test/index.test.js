const request = require("supertest");
const { app, startServer } = require("../app");
const { expect } = require("chai");

let server;
const testAddress = "0xe196efB0166Fa2351a736047C0935Ac9C456421B";
const toAddress = "0x6A7c2Db171FD9999733Dca0A653fCfC3620d4bf7";
const testAmount = "100";

before(async () => {
    server = await startServer(); // 启动服务器
});

after(() => {
    server.close(); // 关闭服务器
});

describe("StableCoin API Tests", () => {

    it("/mint should mint tokens", async () => {
        const res = await request(app)
            .post("/mint")
            .send({ to: testAddress, amount: testAmount });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Minted");
    });

    it("/burn should burn tokens", async () => {
        const res = await request(app)
            .post("/burn")
            .send({ amount: testAmount });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Burned");
    });

    it("/transfer should transfer tokens", async () => {
        const res = await request(app)
            .post("/transfer")
            .send({ to: toAddress, amount: testAmount });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Transferred");
    });

    it("/pause should pause contract", async () => {
        const res = await request(app)
            .post("/pause");

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Paused");
    });

    it("/unpause should unpause contract", async () => {
        const res = await request(app)
            .post("/unpause");

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Unpaused");
    });

    it("/grant-minter should grant MINTER_ROLE", async () => {
        const res = await request(app)
            .post("/grant-minter")
            .send({ address: testAddress });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Granted MINTER_ROLE");
    });

    it("/blacklist/add should add user to blacklist", async () => {
        const res = await request(app)
            .post("/blacklist/add")
            .send({ address: testAddress });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("blacklist");
    });

    it("/blacklist/remove should remove user from blacklist", async () => {
        const res = await request(app)
            .post("/blacklist/remove")
            .send({ address: testAddress });

        expect(res.statusCode).to.equal(200);
        expect(res.body.message).to.contain("Removed");
    });

});
