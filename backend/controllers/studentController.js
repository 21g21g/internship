const CompanyApplication = require('../models/companyApplication');
const Application = require('../models/internApplicationModel');
const Internship = require('../models/internshipModel');
const User = require('../models/userModel');
const Plan = require('../models/planModel');
const Payment = require('../models/paymentMmodel');
const axios = require('axios'); // For making HTTP requests
const { v4: uuidv4 } = require('uuid');

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const { createPayment } = require('../utils/createPayment');
dotenv.config();
// Controller for students to apply for an internship
exports.applyForInternship = async (req, res) => {
    const { coverLetter, portfolioUrl } = req.body;
    const { internshipId } = req.params;
    const studentId = req.user._id; // Assuming req.user contains student info
    const resume = req.file ? req.file.path : null; // Get the resume file path
    try {
        // Check if the internship exists
        const internship = await Internship.findById(internshipId);
        if (!internship) {
            return res.status(404).json({ message: 'Internship not found' });
        }
        // Create a new application
        const application = new Application({
            internship: internshipId,
            student: studentId,
            coverLetter,
            resume,
            portfolioUrl // Make sure this field is correctly assigned
        });
        const savedApplication = await application.save();
        // Add the application to the internship's applications array
        internship.applications.push(savedApplication._id);
        await internship.save();
        res.status(201).json(savedApplication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getApplications = async (req, res) => {
    const studentId = req.user._id; // Assuming req.user contains student info

    try {
        // Find applications where the student is the applicant
        const applications = await Application.find({ student: studentId })
            .populate({
                path: 'internship',
                populate: {
                    path: 'company',
                    select: 'companyDetails' // Select only the companyDetails field
                }
            })
            .populate('student');

        res.status(200).json(applications);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.applyToCompany = async (req, res) => {
    const {
        name,
        slogan,
        description,
        industry,
        location,
        managerName,
        jobTitle,
        contactNumber,
        website,

    } = req.body;
    const license = req.files?.license ? req.files.license[0] : null;
    const logo = req.files?.logo ? req.files.logo[0] : null;
    const userId = req.user.id;
    const { planId } = req.params; // Extract planId from URL parameters

    try {
        // Validate the ObjectId for planId
        if (!mongoose.Types.ObjectId.isValid(planId)) {
            return res.status(400).json({ message: 'Invalid subscription plan ID' });
        }

        const application = new CompanyApplication({
            user: userId,
            name,
            slogan,
            description,
            industry,
            location,
            managerName,
            jobTitle,
            contactNumber,
            website,
            license: "uploads/" + license.filename,
            logo: "uploads/" + logo.filename,
            subscriptionPlan: planId
        });

        const savedApplication = await application.save();
        res.status(201).json(savedApplication);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.selectPlan = async (req, res) => {
    const { planId } = req.body;
    const userId = req.user._id;

    try {
        const plan = await Plan.findById(planId);
        if (!plan) {
            return res.status(404).json({ message: 'Plan not found' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const payment = new Payment({
            user: user._id,
            plan: plan._id,
            currency: 'ETB',
            amount: plan.price,
            status: 'pending',
            tx_ref: `tx_ref_${Date.now()}`
        });
        await payment.save();
        const paymentData = {
            amount: payment.amount.toString(), // Ensure amount is a string
            currency: payment.currency,
            email: user.email,
            first_name: user.name,
            phone_number: user.phone,
            tx_ref: payment.tx_ref,
            callback_url: `http://localhost:5000/api/payment/callback?tx_ref=${payment.tx_ref}`, // Adjust callback URL
            return_url: ` http://localhost:5173/student/apply-company-form/${payment.plan._id}`,
            customization: {
                title: 'Payment Plan',
                description: `Payment for ${plan.type} plan`,
                backgroundColor: '#0000FF', // Blue background
                buttonColor: 'blue'
            },
        };
        // console.log(`Payment data to be sent to Chapa: ${JSON.stringify(paymentData)}`);
        const chapaResponse = await axios.post('https://api.chapa.co/v1/transaction/initialize', paymentData, {
            headers: {
                Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        // console.log(`Chapa response: ${JSON.stringify(chapaResponse.data)}`);

        if (chapaResponse.data.status !== 'success') {
            return res.status(500).json({ message: 'Payment initialization failed' });
        }

        res.status(200).json({ payment_url: chapaResponse.data.data.checkout_url });
    } catch (error) {
        // console.error('Error selecting plan:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Server error' });
    }
};

// exports.TransactionPay = async (req, res) => {
//     try {
//         const response = await axios.get('https://api.chapa.co/v1/transactions', {
//             headers: {
//                 'Authorization': `Bearer ${process.env.CHAPA_SECRET_KEY}`
//             }
//         });

//         // Log the entire response to understand its structure
//         console.log('Full Chapa response:', response.data);

//         // Check if the response contains the expected data structure
//         const payments = response.data.data;

//         if (!payments || !Array.isArray(payments)) {
//             return res.status(500).json({ message: 'Failed to fetch transactions data from Chapa' });
//         }

//         res.status(200).json(payments);
//     } catch (error) {
//         console.error('Error fetching payments:', error);
//         res.status(500).json({ message: 'Failed to fetch payments' });
//     }
// };
// exports.paymentCallback = async (req, res) => {
//     const { tx_ref, status } = req.query;

//     try {
//         const payment = await Payment.findOne({ tx_ref }).populate('user plan');

//         if (!payment) {
//             return res.status(404).json({ message: 'Payment not found' });
//         }

//         if (status === 'success') {
//             payment.status = 'completed';
//             await payment.save();

//             payment.user.subscriptionPlan = payment.plan._id;
//             await payment.user.save();

//             const planId = payment.plan._id;
//             const redirectUrl = `http://localhost:5173/payment-success?planId=${planId}&status=success`;
//             res.redirect(redirectUrl);
//         } else {
//             payment.status = 'failed';
//             await payment.save();
//             res.status(400).json({ message: 'Payment failed' });
//         }
//     } catch (error) {
//         console.error('Error handling payment callback:', error.response ? error.response.data : error.message);
//         res.status(500).json({ message: 'Server error' });
//     }
// }

exports.getAllInternships = async (req, res) => {
    try {
        const filters = {};

        if (req.query.location) {
            filters.location = req.query.location;
        }

        if (req.query.company) {
            filters.company = req.query.company;
        }

        if (req.query.industry) {
            filters.industry = req.query.industry;
        }

        if (req.query.type) {
            filters.type = req.query.type;
        }

        if (req.query.payment) {
            filters.payment = req.query.payment;
        }

        const internships = await Internship.find(filters).populate({
            path: 'company',
            select: 'companyDetails',
        });

        if (!internships.length) {
            return res.status(404).json({ message: 'No internships found' });
        }

        res.status(200).json(internships);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.paymentCallback = async (req, res) => {
    const { tx_ref, status } = req.query;

    try {
        const payment = await Payment.findOne({ tx_ref }).populate('user plan');

        if (!payment) {
            return res.status(404).json({ message: 'Payment not found' });
        }

        if (status === 'success') {
            payment.status = 'completed';
            await payment.save();

            payment.user.subscriptionPlan = payment.plan._id;
            await payment.user.save();

            const planId = payment.plan._id;
            const redirectUrl = `http://localhost:5173/payment-success?planId=${planId}&status=success`;
            res.redirect(redirectUrl);
        } else {
            payment.status = 'failed';
            await payment.save();
            res.status(400).json({ message: 'Payment failed' });
        }
    } catch (error) {
        console.error('Error handling payment callback:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Server error' });
    }
}