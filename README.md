# CreatorsPRO Project

This is the Omnes Blockchain repository for the smart contracts of CreatorsPRO. The repository from CreatorsPRO project can be found [here](https://github.com/musicpro-live/creatorpro_smartcontracts).

[Here](https://miro.com/app/board/uXjVP0aPwQo=/) a diagram of the smart contracts structure can be found.

## Resources

To better understand the smart contracts structure, features and functionalities, refer to this list of resources:
- Beacon proxy: [OpenZeppelin's Beacon Proxy Workshop Video](https://www.youtube.com/watch?v=2oUHr8hxzBA)
- UUPS: [OpenZeppelin's UUPS Workshop Video](https://www.youtube.com/watch?v=kWUDTZhxKZI)
- OpenSea's on-chain royalties enforcement:
    - [Web3 Club video explanation](https://www.youtube.com/watch?v=4spapOTVpNA)
    - [@cygaar Twitter thread (Chiru Labs developer)](https://twitter.com/0xcygaar/status/1589787467443765248?s=46&t=iE4ffqs_8qPzPcuDUftWbg)
    - [OpenSea's ERC721 smart contract example (GitHub repository)](https://github.com/ProjectOpenSea/operator-filter-registry)
- ERC2981 (token royalties standard): [upgradeable smart contract example in DethCode](https://etherscan.deth.net/token/0xb528efe424c6c9e16f524b2d13825e21c9fd05e2#code)


## Contratos implementados

```ml
principais
├─ Management — "Contrato Principal de criação de coleções e crowdfundings"
├─ inicializadores das criações:
│  ├─ newArtCollection — "Inicialização da criação dos NFTs ERC721Art - Somente por criadores autorizados"
│  ├─ newCreatorsCollection — "Inicialização da criação dos NFTs ERC721Art - Somente por management (Funcionários da Creators) autorizados"
│  ├─ newCrowdfund — "Inicialização do Crowdfunding - Somente permitido por endereços management (Funcionários da Creators)"
├─ CretorsCoin — "Contrato token ERC20"
├─ ERC721Art — "Contrato de todas as coleções de NFT mesmo aquelas derivadas do Crowdfund"
├─ Escrow — "Contrato de envio de valores em toda compra no cartão de crédito cujo o criador pode sacar a cada 7 dias"
mocks
├─ MockMultisig — "Contrato de conta teste multisig para envio de valores - obrigatoriámente devem criar uma conta na [**GnosisSafe**](https://app.safe.global/welcome)"
├─ MockUSDToken — "Contrato de mock referente a USD"
interfaces
├─ IManagment — "Interface do Managment"
├─ Definições enum e struct:
│  ├─ Coin — "Moedas permitidas definidas em enum ETH, USD e CRETORS_TOKEN"
│  ├─ CrowdFundParams — "Todos os paramêtros referente a criação do Crowdfunding"
├─ ICrowdfund — "Interface do Crowdfund com parâmetros importantes para entendimento"
├─ Definições enum e struct:
│  ├─ QuotaClass — "As classes das Quotas separadas em LOW, REGULAR e HIGH"
│  ├─ InvestIdInfos — "Informações do endereço do investimento"
│  ├─ QuotaInfos — "Informações das quotas"
librarys
├─ @chirulabs — "Library para implementação do contrato ERC721AUpgradleable"
├─ @opensea — "Implementação do Royalties mais atual on-chain"
├─ @openzeppelin — "Library na utilização dos proxys e principais contratos de Upgradleable"
├─ @solmate — "Implementação do ERC20 mais eficiente"
```

## Endereços deployados na rede Sepolia para testes:

-   [Management](https://sepolia.etherscan.io/address/0x264C670497FEE62fa796D51f15Eb09BD127b0C7d#writeProxyContract)
-   Para conseguir criar collections ou crowdfunding é necessário ter autorização para ser um criador ou management
-   [USDT Mock - 18 decimals](https://sepolia.etherscan.io/address/0xD10C17d2e9deAD078EB74f3773545207EE1A7CF7)
-   [CreatorsCoin Mock - 6 decimals](https://sepolia.etherscan.io/address/0xF320f9742E3D8355AD4fF9bA0Fc5577906FD66D0)
-   Faça o mint dos tokens acima respeitando suas casas decimais e  o `Approve` para os endereços abaixo para conseguir realizar o mint na coleção ou crowndfunding.
-   [Collection test ERC721Art](https://sepolia.etherscan.io/address/0x66bbf65c854e7f3e9175928aa78224874de42dc3#writeProxyContract) Com os seguintes valores para mint:

0,01 ether
1 USD (18 decimals)
1 CreatorsCoin (6 decimals)

-   [Collection test Crowdfunding](https://sepolia.etherscan.io/address/0x9b2fbf56d03e2f9db419253b896fd9e7d1c9664f#writeProxyContract) Com os seguintes valores para invest:
0,01 ether LOW
1 USD (18 decimals) LOW
1 CreatorsCoin (6 decimals) LOW

0,02 ether REGULAR
2 USD (18 decimals) REGULAR
2 CreatorsCoin (6 decimals) REGULAR

0,05 ether HIGH
5 USD (18 decimals) HIGH
5 CreatorsCoin (6 decimals) HIGH

Total de quotas: 15

#### Sempre verifique caso queira interagir com eles no explorador de bloc:

1. git clone 
2. npm install (`npm install`)
3. configure o .env 
4. verify (`npx hardhat verify --network sepolia <address contract>`)

-   obs. provavelmente aparecerá o erro: `Successfully linked proxy to implementation.
An unexpected error occurred: Error: Verification completed with the following errors.` mas funcionará da mesma maneira.

## Contratos em implementação

```ml
├─ CRPStaking — "Contrato de staking vinculado ao CrowdFunding e recompensas a cada 30 dias"
├─ funções importantes:
│  ├─ stake — "Stake dos NFTs pelos Ids"
│  ├─ withdraw — "Retirada dos NFTs conforme os Ids"
│  ├─ withdrawToAddress — "Retirada dos NFTs conforme os Ids para algum endereço por endereço autorizado pelo management"
│  ├─ claimRewards — "Claim dos rewards referente aos NFT stakados dos usuários com retirada de 5% para a conta da CreatorsPro conforme tokenomics"
│  ├─ depositRewardTokens — "Depósito pelos Managers das CreatorsCoin para os rewards"
│  ├─ splitUSD — "O artista pode distribuir dólar para os seus holders"
│  ├─ claimUSD — "O usuário retira seu dólar conforme a proporção de NFTs que possue do artista"
├─ CRPReward — "Contrato da Creators com sua própria lógica de reward baseado na interação com a plataforma da Creators e com o hashpower dos NFTs"
├─ funções já em produção:
│  ├─ increasePoints — "Acrescentar pontuação ao usuário conforme o ID do token e números de interações"
│  ├─ removeToken — "Remoção do Token referente a coleções para reward da CreatorsPro"
│  ├─ depositRewardTokens — "Deposito de tokens de reward no contrato"
│  ├─ claimRewards — "Claim dos rewards dos usuários com retirada de 5% para a conta da CreatorsPro conforme tokenomics"
│  ├─ setHashObject — "Setar o hashpower das coleões e IDs em específicos, sendo esse o fator multiplicador do reward"
│  ├─ setRewardCondition — "Setar as condições de recompensas"
│  ├─ _addToken — "Função interna de setar token"
```

## Referências para interações step-by-step

#### Management contract criação de coleções

-   Antes de inciar qualquer coleção ou crowdfunding deve verificar se o endereço está autorizado em `managers` onde é armazenado em um mapping publico:

```solidity
///@dev mapping that specifies if address is a manager (true) or not (false)
    mapping(address => bool) public managers;
```
-   Para autorizar um manager no contrato deve interagir com a função de setar o manager `setManager` para interação com a `newCretorsCollection`

```solidity
/** @dev only managers allowed to call this function. _manager must
    not be zero address. */
    /// @inheritdoc IManagement
    function setManager(
        address _manager,
        bool _allowed
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateAddress(_manager);

        managers[_manager] = _allowed;

        emit ManagerSet(_manager, _allowed, msg.sender);
    }
```
```solidity
/** @dev only allowed managers. _name and _symbol must not be empty.
    beaconAdminCreators must not be zero address. */
    /// @inheritdoc IManagement
    function newCreatorsCollection(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        uint256 _price,
        uint256 _priceInUSDC,
        uint256 _priceInCreatorsCoin,
        string memory _baseURI
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateCollectionParams(_name, _symbol);
        __validateAddress(beaconAdminCreators);

        bytes memory ERC721initialize = abi.encodeWithSignature(
            "initialize(string,string,address,uint256,uint256,uint256,uint256,string,uint256)",
            _name,
            _symbol,
            msg.sender,
            _maxSupply,
            _price,
            _priceInUSDC,
            _priceInCreatorsCoin,
            _baseURI,
            0
        );

        BeaconProxy newCollectionProxy = new BeaconProxy(
            beaconAdminCreators,
            ERC721initialize
        );

        collections[address(newCollectionProxy)] = true;

        emit CreatorsCollection(address(newCollectionProxy), msg.sender);
    }
```

-   Ou autorize um criador em `setCreator` para interação com a `newArtCollection` e automaticamente é criado e endereço de um contrato Escrow para o criador. Todos os valores que forem comprados em cartão de crédito serão enviados para essa conta e o criador poderá retirar a cada 7 dias.

```solidity
 /** @dev only managers allowed to call this function. _creator must
    not be zero address. */
    /// @inheritdoc IManagement
    function setCreator(
        address _creator,
        bool _allowed
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateAddress(_creator);

        if (_allowed && creators[_creator].escrow == address(0)) {
            Escrow escrow = new Escrow(_creator);
            creators[_creator].escrow = address(escrow);
        }

        creators[_creator].isAllowed = _allowed;

        emit CreatorSet(_creator, _allowed, msg.sender);
    }
```
```solidity
/** @dev only allowed creators. _name and _symbol must not be empty ("").
    beaconAdminArt must not be zero address. */
    /// @inheritdoc IManagement
    function newArtCollection(
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        uint256 _price,
        uint256 _priceInUSD,
        uint256 _priceInCreatorsCoin,
        string memory _baseURI,
        uint256 _royalty
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyCreators();
        __validateCollectionParams(_name, _symbol);
        __validateAddress(beaconAdminArt);
        __whenCreatorNotCorrupted();

        bytes memory ERC721initialize = abi.encodeWithSignature(
            "initialize(string,string,address,uint256,uint256,uint256,uint256,string,uint256)",
            _name,
            _symbol,
            msg.sender,
            _maxSupply,
            _price,
            _priceInUSD,
            _priceInCreatorsCoin,
            _baseURI,
            _royalty
        );

        BeaconProxy newCollectionProxy = new BeaconProxy(
            beaconAdminArt,
            ERC721initialize
        );

        collections[address(newCollectionProxy)] = true;

        emit ArtCollection(address(newCollectionProxy), msg.sender);
    }
```
-   Caso inserir `_price` que é referente a moeda nativa converter em wei [eth-to-wei](https://www.eth-to-wei.com/), se não forem vender na moeda nativa inserir um valor alto. Sendo em `_priceInUSD` observar sempre as casas decimais do token no caso do USDT na Polygon são 6 casas decimais. Ao inserir o `_priceInCreatorsCoin` conferir da mesma forma as casas decimais, os padrões ERC20 geralmente são 18 casas decimais.

-   Caso inserir `_royalty` setar no máximo em 600 (6%) para ter compatibilidade com os marketplaces.

#### Management contract criação de Crowdfunding

-   Autorize um criador em `setCreator` para interação com a `newCrowdfund`

```solidity
/** @dev only allowed creators. _name and _symbol must not be empty.
    beaconAdminFund must not be zero address. */
    /// @inheritdoc IManagement
    function newCrowdfund(
        string memory _name,
        string memory _symbol,
        string memory _baseURI,
        uint256 _royalty,
        CrowdFundParams memory _cfParams
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyCreators();
        __validateCollectionParams(_name, _symbol);
        __validateAddress(beaconAdminFund);
        __whenCreatorNotCorrupted();

        if (
            _cfParams._amountLowQuota +
                _cfParams._amountRegQuota +
                _cfParams._amountHighQuota ==
            0
        ) {
            revert ManagementFundMaxSupplyIs0();
        }

        bytes memory ERC721ArtInitialize = abi.encodeWithSignature(
            "initialize(string,string,address,uint256,uint256,uint256,uint256,string,uint256)",
            _name,
            _symbol,
            msg.sender,
            _cfParams._amountLowQuota +
                _cfParams._amountRegQuota +
                _cfParams._amountHighQuota,
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff,
            _baseURI,
            _royalty
        );

        BeaconProxy newArtCollectionProxy = new BeaconProxy(
            beaconAdminArt,
            ERC721ArtInitialize
        );

        bytes memory ERC721FundInitialize = abi.encodeWithSignature(
            "initialize(uint256[3],uint256[3],uint256[3],uint256,uint256,uint256,address,uint256,uint256,address)",
            _cfParams._valuesLowQuota,
            _cfParams._valuesRegQuota,
            _cfParams._valuesHighQuota,
            _cfParams._amountLowQuota,
            _cfParams._amountRegQuota,
            _cfParams._amountHighQuota,
            _cfParams._donationReceiver,
            _cfParams._donationFee,
            _cfParams._minSoldRate,
            address(newArtCollectionProxy)
        );

        BeaconProxy newFundCollectionProxy = new BeaconProxy(
            beaconAdminFund,
            ERC721FundInitialize
        );

        IERC721Art(address(newArtCollectionProxy)).setCrowdfund(
            address(newFundCollectionProxy)
        );

        collections[address(newArtCollectionProxy)] = true;

        emit Crowdfund(
            address(newFundCollectionProxy),
            address(newArtCollectionProxy),
            msg.sender
        );
    }
```
-   Parâmetros do `_cfParams` extremamente importantes na criação:

0 -> Matic (wei - 18 decimals)
1 -> USDT (6 decimals)
2 -> CreatorsCoin (18 decimals)

-   Exemplo:
                                    0         1          2
    [`_valuesLowQuota`[1000000000000000000, 1000000, 1000000000000000000],
    `_valuesRegQuota`:[2000000000000000000, 2000000, 2000000000000000000],
    `_valuesHighQuota`:[5000000000000000000, 5000000, 5000000000000000000],
    `_amountLowQuota`:1000,
    `_amountLowQuota`:100,
    `_amountLowQuota`:10,
    `_donationReceiver`:"0xAaa7cCF1627aFDeddcDc2093f078C3F173C46cA4",
    `_donationFee`:400,
    `_minSoldRate`:2500]

#### Management contract criação do Staking (reward) relacionado ao contrato de Crowdfunding

-   Autorize um criador em `setCreator` para interação com a `newCRPStaking`

```solidity
/** @dev only allowed creators. _name and _symbol must not be empty ("").
    beaconAdminArt must not be zero address. */
    /// @inheritdoc IManagement
    function newCRPStaking(
        address _stakingToken,
        uint256 _timeUnit,
        uint256[3] calldata _rewardsPerUnitTime
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyCreators();
        __validateAddress(beaconAdminStaking);
        __whenCreatorNotCorrupted();

        if (!collections[_stakingToken]) {
            revert ManagementInvalidCollection();
        }
        if (IERC721ArtHandle(_stakingToken).owner() != msg.sender) {
            revert ManagementNotCollectionCreator();
        }

        bytes memory CRPStakingInitialize = abi.encodeWithSignature(
            "initialize(address,uint256,uint256[3])",
            _stakingToken,
            _timeUnit,
            _rewardsPerUnitTime
        );

        BeaconProxy newStakingProxy = new BeaconProxy(
            beaconAdminStaking,
            CRPStakingInitialize
        );

        collections[address(newStakingProxy)] = true;
        stakingCollections[address(newStakingProxy)] = true;

        emit CRPStaking(address(newStakingProxy), msg.sender);
    }
```
-   Endereço no parâmetro `_stakingToken` é referente ao endereço da coleção e vai verificar se existe antes da criação do contrato de Staking (reward) que tem total vinculação com o de crowndfunding. 

-   No parâmetro `_timeUnit` deve ser setado no mínimo 30 dias que deve ser setado em timestamp [unix-timestamp](https://www.unixtimestamp.com/) 

-   No parâmetro `_rewardsPerUnitTime` é referente ao valor de recompensa pelo prazo de 30 dias em CreatorsCoin (lembrando que será um utility token por questões regulatórias, somente terá benefícios e utilidades na plataforma CreatorsPro)

#### Management contract demais definições

```solidity
/** @dev only managers allowed to call this function. _new must
    not be zero address. */
    /// @inheritdoc IManagement
    function setMultiSig(address _new) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateAddress(_new);

        multiSig = _new;

        emit NewMultiSig(_new, msg.sender);
    }
```
-   ^Parâmetro de endereço da multisig `_new` que será direcionado todos os royalties e fees da Creators de todas as coleções e crowdfunding criados.

```solidity
/** @dev only managers allowed to call this function. */
    /// @inheritdoc IManagement
    function setFee(uint256 _fee) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();

        fee = _fee;

        emit NewFee(_fee, msg.sender);
    }
```
-   ^Parâmetro de setar a taxa em `_fee` que a Creators vai ganhar em todas as vendas primárias ou mercado secundário. Foi definido 2%, então setar 200.

```solidity
/** @dev only managers allowed to call this function */
    /// @inheritdoc IManagement
    function setTokenContract(
        Coin _coin,
        address _contract
    ) external override(IManagement) {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateAddress(_contract);
        if (_coin == Coin.ETH_COIN) {
            revert ManagementCannotSetAddressForETH();
        }

        /**@dev Mumbai address = 0xA02f6adc7926efeBBd59Fd43A84f4E0c0c91e832
            Polygon mainnet address = 0xc2132D05D31c914a87C6611C10748AEb04B58e8F
            Goerli address = 0x509Ee0d083DdF8AC028f2a56731412edD63223B9
            Ethereum mainnet address = 0xdAC17F958D2ee523a2206206994597C13D831ec7 */
        tokenContract[_coin] = IERC20(_contract);

        emit TokenContractSet(msg.sender, _contract, _coin);
    }
```
-   ^Parâmetro de setar os endereços das Coins em `_coin` sendo arrays: 0, 1 e 2 (ETH, USDT, CREATORSCOIN) nessa ordem de endereços de contratos `_contract`.

```solidity
/** @dev only managers allowed to call this function */
    /// @inheritdoc IManagement
    function setCorrupted(address _creator, bool _corrupted) external {
        __nonReentrant();
        __whenNotPaused();
        __onlyManagers();
        __validateAddress(_creator);
        if (!creators[_creator].isAllowed) {
            revert ManagementAddressNotCreator();
        }

        isCorrupted[_creator] = _corrupted;

        emit CorruptedAddressSet(msg.sender, _creator, _corrupted);
    }
```
-   ^Parâmetro dos endereços de criadores comprometidos em caso de escandalo em `_creator` modificando para true ou false em `_corrupted`.

## Ordem de interações com as coleções, crowdfunding, staking e reward CretorsPro

#### ERC721Art

```solidity
    function setBaseURI(string memory _uri) external override(IERC721Art) {
        __whenNotPaused();
        __nonReentrant();
        __onlyAuthorized();

        baseURI = _uri;
```
-   Setar depois da validação interna do time da Cretors o URI em `setBaseURI`.


```solidity
    function mint(
        uint256 _tokenId,
        IManagement.Coin _coin
    ) public payable virtual override(IERC721Art)
```
-   Mint pelo usuário que tem endimento em web3 `mint` selecionar a coin inserindo 0 sendo em matic (convertendo em wei), 1 em usdt e 2 em cretorsCoin respeitando as suas casas decimais.


```solidity
    function mintToAddress(
        address _to,
        uint256 _tokenId
    ) external override(IERC721Art) 
```
-   Mint por cartão de crédito ou pix `mintToAddress`.


```solidity
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external override(IERC721Art) 
```
-   Transferência do Opensea ou cartão de crédito e PIX com o dono do NFT permitindo que a CretorsPro opere seu ativo.


```solidity
    function setPrice(
        uint256 _price,
        IManagement.Coin _coin
    ) external override(IERC721Art)
```
-   O dono do NFT pode setar um novo preço para listar na plataforma da CretorPro permitindo que consigam comprar com cripto.


```solidity
function creatorsProSafeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        IManagement.Coin coin
    ) public payable override(IERC721Art)
```
-   Após definido o preço novo na coin estabalecida pelo dono do NFT o usuário pode executar a transferência da creatorsPro com pagamento em cripto, sem intermediários.

...

#### Crowdfund

```solidity
    function invest(
        uint256 _amountOfLowQuota,
        uint256 _amountOfRegularQuota,
        uint256 _amountOfHighQuota,
        IManagement.Coin _coin
    ) external payable override(ICrowdfund)
```
-   Investimento em Quotas com os valores específicados na criação em contrato Management. obs. Preencher uma cota por vez em sua quantidade específica e selecionando a Coin.

```solidity
    function investForAddress(
        address _investor,
        uint256 _amountOfLowQuota,
        uint256 _amountOfRegularQuota,
        uint256 _amountOfHighQuota,
        IManagement.Coin _coin
    ) external payable override(ICrowdfund)
```
-   Investimento em Quotas com os valores específicados no cartão de crédito mandando para o endereço comprador. obs. Preencher uma cota por vez em sua quantidade específica e selecionando a Coin. Obs. Nesse caso como a Creators vai executar aconselhamos enviar para a própria conta e depois executar o `mint` estamos em produção de inserir o `mintToAddress`.

```solidity
    function donate(
        uint256 _amount,
        IManagement.Coin _coin
    ) external payable override(ICrowdfund)
```
-   Doação por cripto direto para o crowndfunding sem ter direito ao NFT.

```solidity
    function donateForAddress(
        address _donor,
        uint256 _amount,
        IManagement.Coin _coin
    ) external payable override(ICrowdfund)
```
-   Doação por cartão de crédito direto para o crowndfunding sem ter direito ao NFT.

```solidity
    function refundAll() external override(ICrowdfund) {
        __whenNotPaused();
        __nonReentrant();
        __checkIfInvestor(msg.sender);
```
-   Possibilidade de refound do valor todo do endereço que investiu. obs. antes de 7 dias

```solidity
    function refundWithInvestId(uint256 _investId) public override(ICrowdfund) {
        __whenNotPaused();
        __nonReentrant();
        __checkIfInvestor(msg.sender);
```
-   Possibilidade de refound do valor referente a ID específico, onde o investidor pode verificar seus IDs na função de retorno `getInvestIdsPerInvestor`. obs. antes de 7 dias

```solidity
     function refundToAddress(address _investor) external override(ICrowdfund) {
        __nonReentrant();
        __onlyAuthorized();
        __checkIfInvestor(_investor);
```
-   Possibilidade de refound do valor de todas as cotas do endereço. obs. antes de 7 dias

#### Repita o processo de investimento até completar 25% do total de quotas e continue as etapas abaixo

```solidity
     function mint() external override(ICrowdfund) {
        __whenNotPaused();
        __nonReentrant();
        __notCorrupted();
        __checkIfMinGoalReached();
```
-   Mint da carteira do endereço que possui a quota e atingindo os 25%.

```solidity
     function withdrawFund() external override(ICrowdfund) {
        __whenNotPaused();
        __nonReentrant();
        __onlyAuthorized();
        __checkIfMinGoalReached();
```
-   Faça o saque dos valores executando o `withdrawFund` confira no explorador de blocos a transação e envio dos valores para a multisig da cretors e pagamento para o criador do crowndfunding.



#### CRPStaking

-   Staking dos NFTs que devem estar vinculados ao Crowdfunding

```solidity
    function stake(
        uint256[] calldata _tokenIds
    ) external override(ICRPStaking) {
        __nonReentrant();
        __whenNotPaused();
```
-   Vai verificar se o endereço é o dono dos IDs inseridos em `_tokenIds` e enviar para o contrato e preencher as definições de stake


-   Saque dos NFTs e já calcula a reward em CratorsCoin e USD

```solidity
    function withdraw(
        uint256[] calldata _tokenIds
    ) external override(ICRPStaking) {
        __nonReentrant();
        __whenNotPaused();
```
-   Vai calcular de acordo com IDs mencionados em `_tokenIds` e enviando diretamente para sua conta.


-   Saque com endereço autorizado dos NFTs e já calcula a reward em CratorsCoin e USD

```solidity
function withdrawToAddress(
        address _staker,
        uint256[] calldata _tokenIds
    ) external override(ICRPStaking) {
        __nonReentrant();
        __onlyAuthorized();
```
-   Vai calcular de acordo com IDs mencionados em `_tokenIds` e enviando diretamente para a conta do `_staker`.

-   Claim das recompensas em CretorsCoin

```solidity
 function claimRewards() external override(ICRPStaking) {
        __nonReentrant();
        __whenNotPaused();
```
-   Retira somente as recompensas conforme seus NFTs em staking.

-   Distribui dólar (USD) para os holders que realizarem staking dos seus NFTs

```solidity
 function splitUSD(
        address _from,
        uint256 _amount
    ) external override(ICRPStaking) {
```
-   O `_from` é o endereço de onde vai sair os USDs e necessáriamente precisa executar o `Approve` autorizando o contrato de staking movimentar os valores de sua carteira na quantidade `_amount` especifícada.

-   O usuário que tiver NFTs em staking conseguirá fazer o claim de USD e receberá de acordo com a quantidade em staking.

```solidity
function claimUSD() external override(ICRPStaking) {
        __nonReentrant();
        __whenNotPaused();
```


#### CRPReward


<!-- LICENSE -->

## License

Distributed under the MIT License.