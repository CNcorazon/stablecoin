// contracts/XDAccessManager.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/manager/AccessManager.sol";

contract XDAccessManager is AccessManager {
    constructor(address initialAdmin) AccessManager(initialAdmin) {}
}