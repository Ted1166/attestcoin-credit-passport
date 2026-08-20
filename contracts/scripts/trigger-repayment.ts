import { network } from "hardhat";

const SOURCE_REPAYMENT_EMITTER_ADDRESS = "0x53643A47055c11C51B3094603D9a9ABa1D227f97";

async function main() {
    const { ethers } = await network.connect();
    const [signer] = await ethers.getSigners();

    const emitter = await ethers.getContractAt(
        "SourceRepaymentEmitter",
        SOURCE_REPAYMENT_EMITTER_ADDRESS
    );

    const amount = ethers.parseEther("1");

    console.log(`Recording repayment: borrower=${signer.address}, amount=${amount.toString()}`);
    const tx = await emitter.recordRepayment(signer.address, amount);
    const receipt = await tx.wait();

    console.log(`✅ RepaymentMade emitted. tx: ${receipt?.hash}`);
    console.log(`block: ${receipt?.blockNumber}`);
    console.log(`\nStart the worker now (from worker/): npm run dev`);
    console.log(`It should pick this transaction up and begin the prove/submit flow.`);
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});