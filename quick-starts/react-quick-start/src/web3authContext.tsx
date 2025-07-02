// IMP START - Quick Start
import { MFA_LEVELS, WALLET_CONNECTORS, WEB3AUTH_NETWORK } from "@web3auth/modal";
import { type Web3AuthContextConfig } from "@web3auth/modal/react";
import { createConfig, http } from "wagmi";
import { sepolia, mainnet } from "wagmi/chains"; // 添加更多链支持切换
// IMP END - Quick Start

// IMP START - Dashboard Registration
const clientId = "BJmSRPeqSbakNOT-vrNlZ9MAoshoh3RifJ1kn1pG-QGiZnKZBo0wDPTUo65unP5a2_0VNQxjNsSKrkqAeIcSqQI"; // get from https://dashboard.web3auth.io
// IMP END - Dashboard Registration

// IMP START - Wagmi Config (用于网络切换)
export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia], // 支持多链切换
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});
// IMP END - Wagmi Config

// IMP START - Config
const web3AuthContextConfig: Web3AuthContextConfig = {
  web3AuthOptions: {
    clientId,
    web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
    mfaLevel: MFA_LEVELS.NONE,
    modalConfig: {
      connectors: {
        [WALLET_CONNECTORS.AUTH]: {
          label: "auth",
          loginMethods: {
            // google: {
            //   name: "google login",
            //   authConnectionId: "tlnt-google",
            // },
          },
        },
      },
    },
  },
};
// IMP END - Config

export default web3AuthContextConfig;
