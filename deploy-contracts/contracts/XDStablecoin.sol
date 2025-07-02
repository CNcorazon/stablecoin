// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessManaged} from "@openzeppelin/contracts/access/manager/AccessManaged.sol";
import {AuthorityUtils} from "@openzeppelin/contracts/access/manager/AuthorityUtils.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./extensions/ERC20Blocklist.sol";
import "./extensions/ERC20Custodian.sol";
import "./extensions/ERC20Bridgeable.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ERC20Pausable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Pausable.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract XDStablecoin is ERC20, ERC20Permit, ERC20Burnable, ERC20Pausable, AccessManaged, ERC20Custodian, ERC20Blocklist, ERC20Bridgeable {
    constructor(address initialAuthority)
        ERC20("XDStablecoin", "XD")
        AccessManaged(initialAuthority)
        ERC20Permit("XDStablecoin")
    {
        
    }

    function pause() public restricted {
        _pause();
    }

    function unpause() public restricted {
        _unpause();
    }

    function mint(address to, uint256 amount) public restricted {
        _mint(to, amount);
    }

    function _isCustodian(address user) internal view override returns (bool) {
        (bool immediate,) = AuthorityUtils.canCallWithDelay(authority(), user, address(this), bytes4(_msgData()[0:4]));
        return immediate;
    }

    function blockUser(address user) public restricted {
        _blockUser(user);
    }

    function unblockUser(address user) public restricted {
        _unblockUser(user);
    }

    function _checkTokenBridge(address caller) internal view override {
        (bool immediate,) = AuthorityUtils.canCallWithDelay(
            authority(), 
            caller, 
            address(this), 
            msg.sig  // 当前函数的选择器
        );
        require(immediate, "Unauthorized bridge caller");
    }

    // The following functions are overrides required by Solidity.
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20, ERC20Pausable, ERC20Custodian, ERC20Blocklist)
    {
        super._update(from, to, value);
    }

    function _approve(address owner, address spender, uint256 value, bool emitEvent)
        internal
        override(ERC20, ERC20Blocklist)
    {
        super._approve(owner, spender, value, emitEvent);
    }

    /**
     * @dev 添加 supportsInterface 重写
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        virtual 
        override(ERC20Bridgeable) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }
}