const express = require('express');
const bodyParser = require('body-parser');
const {sequelize} = require('./model');
const {getProfile} = require('./middleware/getProfile');
const app = express();
app.use(bodyParser.json());
app.set('sequelize', sequelize);
app.set('models', sequelize.models);
const {Op} = require("sequelize");
const moment = require('moment');

/**
 * FIX ME!
 * @returns contract by id
 */
app.get('/contracts/:id',getProfile ,async (req, res) =>{
    let profileId = req.profile.dataValues.id;
    console.log("------Profile-id------",profileId);
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Contract.findOne({where: {id:id,ContractorId:profileId}})
    if(contract){
        res.json(contract)

    }
    else
        return res.status(400).end()
});

app.get('/contracts', getProfile, async (req, res) => {
    let profileId = req.profile.dataValues.id;
    const {Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Contract.findAll({
        where: sequelize.and(
            {status: {[Op.ne]:'terminated'}},
            sequelize.or(
                {ContractorId: profileId},
                {ClientId: profileId}
            ))
    });
    if (!contract) return res.status(400).end()
    res.json(contract)
});

app.get('/jobs/unpaid', getProfile, async (req, res) => {
    let profileId = req.profile.dataValues.id;
    const {Job,Contract} = req.app.get('models')
    const {id} = req.params
    const contract = await Job.findAll({
       where: {paid: null},
        include: [{
            model: Contract,
            where:   sequelize.and(
                {status: "in_progress"},
                sequelize.or(
                    {ContractorId: profileId},
                    {ClientId: profileId}
                )),
            attributes:[]
           //required: true,
        }]
    });
    if (!contract) return res.status(400).end()
    res.json(contract)
});

app.post('/jobs/:job_id/pay',getProfile, async(req,res) =>{
    let profile = req.profile.dataValues;
    const {Job,Contract,Profile} = req.app.get('models');
    const id = req.params.job_id;
    const jobData = await Job.findOne({where:{id}});
    const contractData = await Contract.findOne({where:{id:jobData.ContractId}});
    console.log("-====",contractData.ContractorId,profile.id,contractData.ClientId,jobData.price,jobData.paid,profile.balance,jobData.ContractId);

    if(profile.id !== contractData.ClientId){
         res.status(400).end("Wrong Client")
    }
    else if(jobData.paid){
         res.status(400).end("Already Paid")
    }
    else if(profile.balance<jobData.price){
         res.status(400).end("Not much amount to pay")
    }
    else {
       const clientUpdate = await Profile.increment({balance: -jobData.price},{where:{id:profile.id}});
      const contractorUpdate = await Profile.increment({balance: jobData.price},{where:{id:contractData.ContractorId}})
        const jobUpdate = await Job.update({paid:true,paymentDate: new Date},{where:{id:id}})
        res.status(200).end("success");
    }

});

app.post('/balances/deposit/:amount',getProfile, async(req,res) =>{
    let profileId = req.profile.dataValues.id;
    const {Job,Contract,Profile} = req.app.get('models');
    const amount = req.params.amount;
    const contract = await Job.findAll({
        attributes: [[sequelize.fn('sum', sequelize.col('price')), 'amountToPay']],
        where: {paid: null},
        include: [{
            model: Contract,
            where:   sequelize.and(
                {status: "in_progress"},
                {ClientId: profileId}
                ),
            attributes:[],
            required: true,
        }],
        raw: true,

    });
    if(contract.length && contract[0].amountToPay>0){
        let amountToPay = contract[0].amountToPay;
        let result = (25*amountToPay)/100;

        if(parseFloat(amount) > parseFloat(result)){
             res.status(400).end("You can't deposit more than 25% total of jobs to pay")
        }
        else {
            const contractorUpdate = await Profile.increment({balance: amount},{where:{id:profileId}})
            res.status(200).end("success");
        }

    }else {
        return res.status(400).end("something wrong with client or not amount to pay")
    }

});

app.get('/admin/best-profession',getProfile,async (req,res) =>{
    let profileId = req.profile.dataValues.id;
    const {Job,Contract,Profile} = req.app.get('models');
    let {start,end} = req.query;
    start = moment(start).startOf('day').format();
    end = moment(end).endOf('day').format();

    if(start>end){
        res.status(400).end('Start Date should be less than end Date')
    }
    else {
        const contract = await Job.findAll({
            attributes: ['Contract.Contractor.profession', [sequelize.fn('sum', sequelize.col('price')), 'total']],
            where: {
                paid: true,
                createdAt: {
                    [Op.gt]:start ,
                    [Op.lt]: end
                }
            },
            include: [{
                model: Contract,
                required: true,
                attributes: [],
                // as: 'contractId',
                include: [{
                    model: Profile,
                    as: 'Contractor',
                    required: true,
                    attributes: []

                }],
            }],
            group: 'Contract.ContractorId',
            raw: true,
            order: sequelize.literal('total DESC'),
            limit: 1
        });
        if (contract.length)
            res.json(contract[0].profession);
        else
            res.status(400).end('No data found')
    }
});

app.get('/admin/best-clients',getProfile,async (req,res) =>{
   try {
       let profileId = req.profile.dataValues.id;
       const {Job, Contract, Profile} = req.app.get('models');
       let {start, end,limit} = req.query;

       limit = limit>0?limit:2;
       start = moment(start).startOf('day').format();
       end = moment(end).endOf('day').format();

       if (start > end) {
           res.status(400).end('Start Date should be less than end Date')
       }
       else {
           const contract = await Job.findAll({
               attributes: [
                   'Contract.Client.id',
                   [sequelize.literal("firstName || ' ' || lastName"), 'fullName'],
                   [sequelize.fn('sum', sequelize.col('price')), 'paid']],
               where: {
                   paid: true,
                   createdAt: {
                       [Op.gt]: start,
                       [Op.lt]: end
                   }
               },
               include: [{
                   model: Contract,
                   required: true,
                   attributes: [],
                   include: [{
                       model: Profile,
                       as: 'Client',
                       required: true,
                       attributes:[]


                   }],
               }],
               group: 'Contract.ClientId',
               raw: true,
               order: sequelize.literal('paid DESC'),
                limit: limit
           });
           if (contract.length)
               res.json(contract);
           else
               res.status(400).end('No data found')
       }
   }
   catch (error){
       console.log("----error------",error)
       res.status(400).end("Something went wrong")
   }

});


module.exports = app;
