// TODO: may transform to an express app not worker
async function main() {}

main().catch((error) => {
  console.log(error);
  process.exit(1);
});
