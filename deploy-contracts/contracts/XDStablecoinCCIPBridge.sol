// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRouterClient} from "@chainlink/contracts-ccip/src/v0.8/ccip/interfaces/IRouterClient.sol";
import {OwnerIsCreator} from "@chainlink/contracts-ccip/src/v0.8/shared/access/OwnerIsCreator.sol";
import {Client} from "@chainlink/contracts-ccip/src/v0.8/ccip/libraries/Client.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/src/v0.8/ccip/applications/CCIPReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./XDStablecoin.sol";

contract XDStablecoinCCIPBridge is CCIPReceiver, OwnerIsCreator {
    using SafeERC20 for IERC20;

    // 错误定义
    error NotEnoughBalance(uint256 currentBalance, uint256 calculatedFees);
    error NothingToWithdraw();
    error FailedToWithdrawEth(address owner, address target, uint256 value);
    error DestinationChainNotAllowlisted(uint64 destinationChainSelector);
    error SourceChainNotAllowlisted(uint64 sourceChainSelector);
    error SenderNotAllowlisted(address sender);
    error InvalidReceiverAddress();
    error InsufficientAllowance();

    // 事件定义
    event MessageSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        address user,
        uint256 amount,
        uint256 fees
    );

    event MessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        address user,
        uint256 amount
    );

    // 状态变量
    XDStablecoin public immutable xdToken;
    
    // 链选择器映射
    mapping(uint64 => bool) public allowlistedDestinationChains;
    mapping(uint64 => bool) public allowlistedSourceChains;
    mapping(address => bool) public allowlistedSenders;

    // CCIP 链选择器常量
    uint64 public constant SEPOLIA_CHAIN_SELECTOR = 16015286601757825753;
    uint64 public constant BSC_TESTNET_CHAIN_SELECTOR = 13264668187771770619;

    constructor(address _router, address _xdToken) CCIPReceiver(_router) {
        require(_xdToken != address(0), "Invalid token address");
        xdToken = XDStablecoin(_xdToken);
        
        // 初始化允许的链
        allowlistedDestinationChains[SEPOLIA_CHAIN_SELECTOR] = true;
        allowlistedDestinationChains[BSC_TESTNET_CHAIN_SELECTOR] = true;
        allowlistedSourceChains[SEPOLIA_CHAIN_SELECTOR] = true;
        allowlistedSourceChains[BSC_TESTNET_CHAIN_SELECTOR] = true;
    }

    modifier onlyAllowlistedDestinationChain(uint64 _destinationChainSelector) {
        if (!allowlistedDestinationChains[_destinationChainSelector])
            revert DestinationChainNotAllowlisted(_destinationChainSelector);
        _;
    }

    modifier onlyAllowlisted(uint64 _sourceChainSelector, address _sender) {
        if (!allowlistedSourceChains[_sourceChainSelector])
            revert SourceChainNotAllowlisted(_sourceChainSelector);
        if (!allowlistedSenders[_sender])
            revert SenderNotAllowlisted(_sender);
        _;
    }

    modifier validateReceiver(address _receiver) {
        if (_receiver == address(0)) revert InvalidReceiverAddress();
        _;
    }

    /**
     * @dev 跨链转移代币
     * @param _destinationChainSelector 目标链选择器
     * @param _receiver 目标链上的接收合约地址
     * @param _user 最终接收代币的用户地址
     * @param _amount 转移的代币数量
     */
    function transferCrossChain(
        uint64 _destinationChainSelector,
        address _receiver,
        address _user,
        uint256 _amount
    )
        external
        payable
        onlyAllowlistedDestinationChain(_destinationChainSelector)
        validateReceiver(_receiver)
        returns (bytes32 messageId)
    {
        // 检查用户授权
        uint256 allowance = xdToken.allowance(msg.sender, address(this));
        if (allowance < _amount) revert InsufficientAllowance();

        // 转移代币到桥合约，然后使用 ERC20Bridgeable 的 crosschainBurn
        xdToken.transferFrom(msg.sender, address(this), _amount);
        xdToken.crosschainBurn(address(this), _amount);  // 使用标准的跨链销毁

        // 构建 CCIP 消息
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(
            _receiver,
            _user,
            _amount
        );

        // 获取路由器实例
        IRouterClient router = IRouterClient(this.getRouter());

        // 计算费用
        uint256 fees = router.getFee(_destinationChainSelector, evm2AnyMessage);

        // 检查用户是否支付了足够的费用
        if (msg.value < fees)
            revert NotEnoughBalance(msg.value, fees);

        // 发送 CCIP 消息
        messageId = router.ccipSend{value: fees}(
            _destinationChainSelector,
            evm2AnyMessage
        );

        // 退还多余的费用
        if (msg.value > fees) {
            (bool success, ) = msg.sender.call{value: msg.value - fees}("");
            require(success, "Failed to refund excess payment");
        }

        emit MessageSent(
            messageId,
            _destinationChainSelector,
            _receiver,
            _user,
            _amount,
            fees
        );

        return messageId;
    }

    /**
     * @dev 处理接收到的跨链消息
     */
    function _ccipReceive(
        Client.Any2EVMMessage memory any2EvmMessage
    )
        internal
        override
        onlyAllowlisted(
            any2EvmMessage.sourceChainSelector,
            abi.decode(any2EvmMessage.sender, (address))
        )
    {
        (address user, uint256 amount) = abi.decode(
            any2EvmMessage.data,
            (address, uint256)
        );

        // 使用 ERC20Bridgeable 的 crosschainMint
        xdToken.crosschainMint(user, amount);

        emit MessageReceived(
            any2EvmMessage.messageId,
            any2EvmMessage.sourceChainSelector,
            abi.decode(any2EvmMessage.sender, (address)),
            user,
            amount
        );
    }

    /**
     * @dev 构建 CCIP 消息
     */
    function _buildCCIPMessage(
        address _receiver,
        address _user,
        uint256 _amount
    ) private pure returns (Client.EVM2AnyMessage memory) {
        return
            Client.EVM2AnyMessage({
                receiver: abi.encode(_receiver),
                data: abi.encode(_user, _amount),
                tokenAmounts: new Client.EVMTokenAmount[](0),
                extraArgs: Client._argsToBytes(
                    Client.EVMExtraArgsV1({gasLimit: 400_000})
                ),
                feeToken: address(0)
            });
    }

    /**
     * @dev 估算跨链转移费用
     */
    function estimateCrossChainFee(
        uint64 _destinationChainSelector,
        address _receiver,
        address _user,
        uint256 _amount
    ) external view returns (uint256 fees) {
        Client.EVM2AnyMessage memory evm2AnyMessage = _buildCCIPMessage(
            _receiver,
            _user,
            _amount
        );
        
        IRouterClient router = IRouterClient(this.getRouter());
        fees = router.getFee(_destinationChainSelector, evm2AnyMessage);
        return fees;
    }

    // 管理员函数保持不变...
    function allowlistDestinationChain(uint64 _destinationChainSelector, bool allowed) external onlyOwner {
        allowlistedDestinationChains[_destinationChainSelector] = allowed;
    }

    function allowlistSourceChain(uint64 _sourceChainSelector, bool allowed) external onlyOwner {
        allowlistedSourceChains[_sourceChainSelector] = allowed;
    }

    function allowlistSender(address _sender, bool allowed) external onlyOwner {
        allowlistedSenders[_sender] = allowed;
    }

    function withdraw(address _beneficiary) public onlyOwner {
        uint256 amount = address(this).balance;
        if (amount == 0) revert NothingToWithdraw();

        (bool sent, ) = _beneficiary.call{value: amount}("");
        if (!sent) revert FailedToWithdrawEth(msg.sender, _beneficiary, amount);
    }

    function withdrawToken(address _beneficiary, address _token) public onlyOwner {
        uint256 amount = IERC20(_token).balanceOf(address(this));
        if (amount == 0) revert NothingToWithdraw();

        IERC20(_token).safeTransfer(_beneficiary, amount);
    }

    receive() external payable {}
}