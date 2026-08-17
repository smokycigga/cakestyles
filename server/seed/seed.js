import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import connectDB from "../config/db.js";
import User from "../models/User.js";
import Customer from "../models/Customer.js";
import Category from "../models/Category.js";
import Product from "../models/Product.js";
import Order from "../models/Order.js";
import Enquiry from "../models/Enquiry.js";
import Invoice from "../models/Invoice.js";
import Expense from "../models/Expense.js";
import Setting from "../models/Setting.js";
import Counter from "../models/Counter.js";
import { slugify } from "../utils/misc.js";
import { nextOrderNumber, nextInvoiceNumber } from "../utils/numbers.js";
import { lineTotal, computeTotals } from "../utils/pricing.js";
import { istDateString, addDaysIst } from "../utils/dates.js";

const today = istDateString();
const daysAgo = (n) => addDaysIst(today, -n);
const daysAhead = (n) => addDaysIst(today, n);

const wipe = async () => {
  await Promise.all([
    User.deleteMany({}),
    Customer.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Order.deleteMany({}),
    Enquiry.deleteMany({}),
    Invoice.deleteMany({}),
    Expense.deleteMany({}),
    Counter.deleteMany({}),
    Setting.deleteMany({}),
  ]);
};

const seed = async () => {
  await connectDB();
  await wipe();

  // --- Users -------------------------------------------------------------
  const owner = await User.create({
    name: "Cakestyles Owner",
    email: (process.env.OWNER_EMAIL || "owner@cakestyles.test").toLowerCase(),
    passwordHash: await bcrypt.hash(process.env.OWNER_PASSWORD || "Cakestyles@123", 10),
    role: "owner",
  });
  console.log(`✅ Owner: ${owner.email}`);

  // --- Settings ------------------------------------------------------------
  await Setting.getSettings();

  // --- Categories ------------------------------------------------------------
  const categories = await Category.insertMany([
    { name: "Cakes", slug: slugify("Cakes"), order: 1, description: "Bento & celebration cakes, baked fresh" },
    { name: "Pastries", slug: slugify("Pastries"), order: 2, description: "Classic bakery pastries" },
    { name: "Brownies", slug: slugify("Brownies"), order: 3, description: "Fudgy, gooey, intense" },
    { name: "Cheesecake Pastries", slug: slugify("Cheesecake Pastries"), order: 4, description: "Creamy slices of heaven" },
    { name: "Tubs", slug: slugify("Tubs"), order: 5, description: "Desserts in a tub" },
    { name: "Cookies", slug: slugify("Cookies"), order: 6, description: "Soft-centered cookies" },
    { name: "Buns", slug: slugify("Buns"), order: 7, description: "Filled buns" },
  ]);

  // --- Products (real Cakestyles catalogue; images to be added by owner) ----
  const defaultAddOns = [
    { name: "Happy Birthday topper", price: 10 },
    { name: "Happy Anniversary topper", price: 10 },
    { name: "Candles", price: 10 },
    { name: "Vanilla ice cream", price: 80 },
  ];
  const p = (data) => ({
    slug: slugify(data.name),
    status: "published",
    availability: "active",
    orderability: "online",
    prepTimeHours: data.prepTimeHours ?? 0,
    addOns: defaultAddOns,
    ...data,
  });
  // helper to pick category by name
  const cat = (name) => categories.find((c) => c.name === name)._id;

  const products = await Product.insertMany([
    // ---- Cakes ----
    p({
      name: "Chocolate Bento cake [300 g]", category: cat("Cakes"), sku: "CAKE-BENTO-CHOC-300",
      shortDescription: "Chocolate truffle bento cake filled with crunch and made with most delicious chocolate ... read more",
      description: "Chocolate truffle bento cake filled with crunch and made with most delicious chocolate ... read more",
      basePrice: 400, prepTimeHours: 24, tags: ["bestseller"],
    }),
    p({
      name: "Black Forest Cake [500 g]", category: cat("Cakes"), sku: "CAKE-BF-500",
      shortDescription: "[veg preparation] Classic Black Forest cake layered with fresh cream, juicy cherries and ... read more",
      description: "[veg preparation] Classic Black Forest cake layered with fresh cream, juicy cherries and ... read more",
      basePrice: 549, prepTimeHours: 24, tags: ["veg"],
    }),
    p({
      name: "Chocolate Mousse Cake [500 g]", category: cat("Cakes"), sku: "CAKE-MOUSS-500",
      shortDescription: "[veg preparation] Delicate chocolate sponge layered with creamy chocolate mousse topped with mini ... read more",
      description: "[veg preparation] Delicate chocolate sponge layered with creamy chocolate mousse topped with mini ... read more",
      basePrice: 589, prepTimeHours: 24, tags: ["veg"],
    }),
    p({
      name: "Chocolate Truffle Cake [500gms]", category: cat("Cakes"), sku: "CAKE-TRUF-500",
      shortDescription: "[veg preparation] An indulgent chocolate cake smeared with chocolate fudge and filled with ... read more",
      description: "[veg preparation] An indulgent chocolate cake smeared with chocolate fudge and filled with ... read more",
      basePrice: 625, prepTimeHours: 24, featured: true, tags: ["bestseller", "veg"],
    }),
    p({
      name: "Ferreiro Rocher Cake [500gms]", category: cat("Cakes"), sku: "CAKE-FRER-500",
      shortDescription: "[Veg preparation] Moist chocolate sponge, creamy chocolate mousse loaded with a lot of ... read more",
      description: "[Veg preparation] Moist chocolate sponge, creamy chocolate mousse loaded with a lot of ... read more",
      basePrice: 700, prepTimeHours: 24, featured: true, tags: ["veg"],
    }),
    p({
      name: "Chocolate Mousse Bento Cake [250 g]", category: cat("Cakes"), sku: "CAKE-BENTO-MOUSS-250",
      shortDescription: "[Veg preparation] Small cake for big celebrations. Soft chocolate sponge layered with creamy ... read more",
      description: "[Veg preparation] Small cake for big celebrations. Soft chocolate sponge layered with creamy ... read more",
      basePrice: 380, prepTimeHours: 24, tags: ["veg"],
    }),
    p({
      name: "Choco Vanilla Bento Cake [250 g]", category: cat("Cakes"), sku: "CAKE-BENTO-CHVA-250",
      shortDescription: "Soft chocolaty sponge layered with vanilla cream and filled with dark and white ... read more",
      description: "Soft chocolaty sponge layered with vanilla cream and filled with dark and white ... read more",
      basePrice: 360, prepTimeHours: 24,
    }),
    p({
      name: "Biscoff Bento Cake", category: cat("Cakes"), sku: "CAKE-BENTO-BISC-250",
      shortDescription: "Soft vanilla sponge layered with biscoff spread and cream and topped with more ... read more",
      description: "Soft vanilla sponge layered with biscoff spread and cream and topped with more ... read more",
      basePrice: 400, prepTimeHours: 24, featured: true, tags: ["bestseller"],
    }),
    // ---- Pastries ----
    p({
      name: "Butterscotch Pastry", category: cat("Pastries"), sku: "PAST-BUTT",
      shortDescription: "Soft sponge layered with delicious butterscotch cream and crispy caramelised nuts in between.",
      description: "Soft sponge layered with delicious butterscotch cream and crispy caramelised nuts in between.",
      basePrice: 80,
    }),
    p({
      name: "Biscoff Pastry", category: cat("Pastries"), sku: "PAST-BISC",
      shortDescription: "Soft velvety sponge layered with yummy biscoff cream and topped with more biscoff ... read more",
      description: "Soft velvety sponge layered with yummy biscoff cream and topped with more biscoff ... read more",
      basePrice: 110, tags: ["bestseller"],
    }),
    p({
      name: "Truffle Pastry", category: cat("Pastries"), sku: "PAST-TRUF",
      shortDescription: "[Veg preparation] Soft chocolate sponge layered with fudgy dark chocolate and crunch caramel.",
      description: "[Veg preparation] Soft chocolate sponge layered with fudgy dark chocolate and crunch caramel.",
      basePrice: 120, tags: ["veg"],
    }),
    // ---- Brownies ----
    p({
      name: "Fudge Brownie", category: cat("Brownies"), sku: "BRWN-FUDG",
      shortDescription: "Super fudgy, intensely chocolatey. Made for serious brownie fans.",
      description: "Super fudgy, intensely chocolatey. Made for serious brownie fans.",
      basePrice: 100, tags: ["bestseller"],
    }),
    p({
      name: "Biscoff Brownie", category: cat("Brownies"), sku: "BRWN-BISC",
      shortDescription: "All the gooey richness of fudge brownies, topped with creamy biscoff spread for ... read more",
      description: "All the gooey richness of fudge brownies, topped with creamy biscoff spread for ... read more",
      basePrice: 120,
    }),
    p({
      name: "Nutella Brownie", category: cat("Brownies"), sku: "BRWN-NUTE",
      shortDescription: "A fudgy chocolate base swirled with Nutella for a double dose of indulgence.",
      description: "A fudgy chocolate base swirled with Nutella for a double dose of indulgence.",
      basePrice: 120,
    }),
    p({
      name: "Assorted 4 brownies", category: cat("Brownies"), sku: "BRWN-ASS4",
      shortDescription: "[Veg preparation] 1 Biscoff brownie, 1 Nutella brownie and 2 fudge brownies.",
      description: "[Veg preparation] 1 Biscoff brownie, 1 Nutella brownie and 2 fudge brownies.",
      basePrice: 400, tags: ["veg"],
    }),
    p({
      name: "Assortment of 6 brownies", category: cat("Brownies"), sku: "BRWN-ASS6",
      shortDescription: "[Veg preparation] you get to taste all our delicious brownies. 2 Fudge, 2 ... read more",
      description: "[Veg preparation] you get to taste all our delicious brownies. 2 Fudge, 2 ... read more",
      basePrice: 580, tags: ["veg"],
    }),
    // ---- Cheesecake Pastries ----
    p({
      name: "Blueberry Cheesecake Slice", category: cat("Cheesecake Pastries"), sku: "CHEE-BLUE",
      shortDescription: "Silky cream cheese, paired with a smooth biscuit base and topped with a ... read more",
      description: "Silky cream cheese, paired with a smooth biscuit base and topped with a ... read more",
      basePrice: 180,
    }),
    p({
      name: "Biscoff Cheesecake Slice", category: cat("Cheesecake Pastries"), sku: "CHEE-BISC",
      shortDescription: "A melt in your mouth delight. Soft and creamy mascarpone cheese sits atop ... read more",
      description: "A melt in your mouth delight. Soft and creamy mascarpone cheese sits atop ... read more",
      basePrice: 190,
    }),
    p({
      name: "Nutella Cheesecake Slice", category: cat("Cheesecake Pastries"), sku: "CHEE-NUTE",
      shortDescription: "[veg preparation] Hazelnut heaven in every bite. A rich mascarpone cheese layer blends ... read more",
      description: "[veg preparation] Hazelnut heaven in every bite. A rich mascarpone cheese layer blends ... read more",
      basePrice: 190, tags: ["veg"],
    }),
    // ---- Tubs ----
    p({
      name: "Tiramisu Tub", category: cat("Tubs"), sku: "TUB-TIRA",
      shortDescription: "[Veg preparation] [Non alcoholic] Our inhouse lady fingers soaked in coffee and layered ... read more",
      description: "[Veg preparation] [Non alcoholic] Our inhouse lady fingers soaked in coffee and layered ... read more",
      basePrice: 250, featured: true, tags: ["veg", "bestseller"],
    }),
    // ---- Cookies ----
    p({
      name: "Chocolate Chip Cookie [Small]", category: cat("Cookies"), sku: "COOK-CHOC-S",
      shortDescription: "Our super delicious gooey chocolate chip cookies with a soft center. Tastes best ... read more",
      description: "Our super delicious gooey chocolate chip cookies with a soft center. Tastes best ... read more",
      basePrice: 50,
    }),
    // ---- Buns ----
    p({
      name: "Korean Bun", category: cat("Buns"), sku: "BUN-KORE",
      shortDescription: "Delectable cream cheese filled bun. The perfect tangy, creamy, cheesy and sweet ... read more",
      description: "Delectable cream cheese filled bun. The perfect tangy, creamy, cheesy and sweet ... read more",
      basePrice: 110,
    }),
  ]);

  // --- Customers ------------------------------------------------------------
  const customers = await Customer.insertMany([
    { name: "Priya Sharma", phone: "9820011223", email: "priya.s@example.com", leadSource: "instagram", tags: ["vip", "repeat"], marketingConsent: true, importantDates: [{ label: "Birthday", date: "1994-03-18" }] },
    { name: "Rahul Mehta", phone: "9820044556", email: "rahul.m@example.com", leadSource: "website", tags: ["repeat"] },
    { name: "Ananya Iyer", phone: "9820077889", email: "ananya.i@example.com", leadSource: "whatsapp", tags: ["wedding"], notes: [{ text: "Prefers less-sweet bakes. Family prefers eggless — always confirm.", by: { name: "system" } }] },
    { name: "Vikram Desai", phone: "9820099001", email: "vikram.d@example.com", leadSource: "walk_in", tags: ["corporate"], addresses: [{ label: "Office", line1: "4th Floor, Trade Tower", city: "Mumbai", pincode: "400051" }] },
    { name: "Sneha Kulkarni", phone: "9820033445", email: "", leadSource: "phone", tags: ["repeat"] },
  ]);

  // --- Orders (spread over ~60 days across channels/statuses) ----------------
  const mkItem = (product, quantity) => {
    const unitPrice = product.basePrice;
    return {
      product: product._id,
      name: product.name,
      variantName: "",
      unitPrice,
      quantity,
      addOns: [],
      lineTotal: lineTotal({ unitPrice, quantity, addOns: [] }),
      isCustom: false,
      notes: "",
    };
  };

  const mkOrder = async ({ customer, source, status, paymentStatus, days, items, fulfilment = { type: "pickup", date: "", slot: "17:00 - 20:00" } }) => {
    const totals = computeTotals({ items, deliveryFee: fulfilment.type === "delivery" ? 50 : 0 });
    const created = new Date(Date.now() - days * 86400000 + 5.5 * 3600000);
    const paid = paymentStatus === "paid";
    const partial = paymentStatus === "partial";
    const payments = paid || partial
      ? [{ amount: partial ? Math.round(totals.grandTotal / 2) : totals.grandTotal, method: source === "website" ? "razorpay" : "upi", ref: "SEED-REF", paidAt: created, recordedBy: { name: "seed" } }]
      : [];
    const amountPaid = payments.reduce((s, x) => s + x.amount, 0);

    return Order.create({
      orderNumber: await nextOrderNumber(),
      customer: customer._id,
      customerSnapshot: { name: customer.name, phone: customer.phone, email: customer.email || "" },
      source,
      fulfilment: { ...fulfilment, date: fulfilment.date || addDaysIst(istDateString(created), 2) },
      items,
      ...totals,
      amountPaid,
      payment: { status: paymentStatus, method: payments[0]?.method || null, payments },
      status,
      statusHistory: [{ status, at: created, by: { name: "seed" } }],
      createdAt: created,
      updatedAt: created,
    });
  };

  const orders = [];
  orders.push(await mkOrder({ customer: customers[0], source: "instagram", status: "completed", paymentStatus: "paid", days: 58, items: [mkItem(products[3], 1)] }));
  orders.push(await mkOrder({ customer: customers[1], source: "website", status: "completed", paymentStatus: "paid", days: 52, items: [mkItem(products[8], 4), mkItem(products[15], 1)] }));
  orders.push(await mkOrder({ customer: customers[4], source: "phone", status: "completed", paymentStatus: "paid", days: 45, items: [mkItem(products[17], 2)] }));
  orders.push(await mkOrder({ customer: customers[0], source: "repeat", status: "completed", paymentStatus: "paid", days: 38, items: [mkItem(products[7], 1)], fulfilment: { type: "delivery", date: "", address: { line1: "12 Rose Villa, Bandra West", city: "Mumbai", pincode: "400050" } } }));
  orders.push(await mkOrder({ customer: customers[3], source: "walk_in", status: "completed", paymentStatus: "paid", days: 30, items: [mkItem(products[12], 6), mkItem(products[13], 2)] }));
  orders.push(await mkOrder({ customer: customers[2], source: "whatsapp", status: "completed", paymentStatus: "paid", days: 22, items: [mkItem(products[1], 1)] }));
  orders.push(await mkOrder({ customer: customers[1], source: "website", status: "completed", paymentStatus: "paid", days: 15, items: [mkItem(products[11], 2)] }));
  orders.push(await mkOrder({ customer: customers[4], source: "phone", status: "completed", paymentStatus: "paid", days: 9, items: [mkItem(products[3], 1), mkItem(products[20], 4)] }));
  orders.push(await mkOrder({ customer: customers[0], source: "instagram", status: "out_for_delivery", paymentStatus: "paid", days: 1, items: [mkItem(products[4], 1)], fulfilment: { type: "delivery", date: today, address: { line1: "12 Rose Villa, Bandra West", city: "Mumbai", pincode: "400050" } } }));
  orders.push(await mkOrder({ customer: customers[3], source: "other", status: "in_preparation", paymentStatus: "partial", days: 1, items: [mkItem(products[6], 2), mkItem(products[10], 4)] }));
  orders.push(await mkOrder({ customer: customers[2], source: "website", status: "confirmed", paymentStatus: "pending", days: 0, items: [mkItem(products[21], 2)] }));

  // --- Invoices ---------------------------------------------------------------
  const inv1 = await Invoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    customer: customers[3]._id,
    customerSnapshot: { name: customers[3].name, phone: customers[3].phone, email: customers[3].email },
    order: orders[4]._id,
    lines: orders[4].items.map((it) => ({ description: it.name, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.lineTotal })),
    subtotal: orders[4].subtotal, tax: { rate: 0, label: "Tax", amount: 0 },
    total: orders[4].grandTotal, amountPaid: orders[4].grandTotal, balanceDue: 0,
    dueDate: daysAgo(28), status: "paid",
    payments: [{ amount: orders[4].grandTotal, method: "cash", date: new Date(Date.now() - 28 * 86400000), recordedBy: { name: "seed" } }],
  });
  await Order.updateOne({ _id: orders[4]._id }, { invoice: inv1._id });

  const inv2 = await Invoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    customer: customers[2]._id,
    customerSnapshot: { name: customers[2].name, phone: customers[2].phone, email: customers[2].email },
    order: orders[5]._id,
    lines: orders[5].items.map((it) => ({ description: it.name, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.lineTotal })),
    subtotal: orders[5].subtotal, tax: { rate: 0, label: "Tax", amount: 0 },
    total: orders[5].grandTotal, amountPaid: Math.round(orders[5].grandTotal / 2),
    balanceDue: Math.round(orders[5].grandTotal / 2),
    dueDate: daysAgo(10), status: "overdue",
    payments: [{ amount: Math.round(orders[5].grandTotal / 2), method: "upi", date: new Date(Date.now() - 20 * 86400000), recordedBy: { name: "seed" } }],
  });
  await Order.updateOne({ _id: orders[5]._id }, { invoice: inv2._id });

  const inv3 = await Invoice.create({
    invoiceNumber: await nextInvoiceNumber(),
    customer: customers[3]._id,
    customerSnapshot: { name: customers[3].name, phone: customers[3].phone, email: customers[3].email },
    lines: [{ description: "Corporate gifting — 40 brownie boxes (advance)", quantity: 40, unitPrice: 400, amount: 16000, isCustom: true }],
    subtotal: 16000, tax: { rate: 0, label: "Tax", amount: 0 }, total: 16000,
    amountPaid: 5000, balanceDue: 11000, dueDate: daysAhead(7), status: "partially_paid",
    payments: [{ amount: 5000, method: "bank_transfer", date: new Date(), recordedBy: { name: "seed" } }],
  });

  // --- Expenses ----------------------------------------------------------------
  const expenses = [];
  const addExpense = async (date, category, description, amount, extra = {}) => {
    expenses.push(await Expense.create({ date, category, description, amount, createdBy: { name: owner.name, userId: owner._id }, ...extra }));
  };
  await addExpense(daysAgo(55), "ingredients", "Flour, cocoa, butter — weekly restock", 8450, { vendor: "BakeMart Wholesale" });
  await addExpense(daysAgo(48), "packaging", "Cake boxes and ribbon", 2100, { vendor: "PackWell" });
  await addExpense(daysAgo(40), "utilities", "Electricity + gas (monthly)", 4600, { recurring: { isRecurring: true, frequency: "monthly" } });
  await addExpense(daysAgo(33), "ingredients", "Cream cheese + cream restock", 5300, { vendor: "Dairy Direct" });
  await addExpense(daysAgo(27), "salaries", "Kitchen helper salary", 12000, { recurring: { isRecurring: true, frequency: "monthly" } });
  await addExpense(daysAgo(20), "marketing", "Instagram promoted posts", 1500);
  await addExpense(daysAgo(13), "ingredients", "Chocolate + Biscoff spread", 6900, { vendor: "BakeMart Wholesale" });
  await addExpense(daysAgo(9), "rent", "Kitchen rent (monthly)", 18000, { recurring: { isRecurring: true, frequency: "monthly" } });
  await addExpense(daysAgo(5), "equipment", "Stand mixer repair", 2600);
  await addExpense(daysAgo(2), "ingredients", "Hazelnuts + fresh cream", 3400);

  // --- Enquiries ----------------------------------------------------------------
  await Enquiry.create({
    customer: customers[2]._id,
    customerSnapshot: { name: customers[2].name, phone: customers[2].phone, email: customers[2].email },
    source: "instagram", eventDate: daysAhead(45), guestCount: 120,
    size: "3 tier", flavours: "Biscoff + black forest alternate tiers",
    designNotes: "Pastel pink and gold theme, fresh flowers, calligraphy topper.",
    budgetRange: "₹15,000 – ₹20,000", status: "quote_sent", quotedAmount: 17500,
    fulfilmentPref: { type: "delivery", address: "Banquet hall, Juhu" },
  });
  await Enquiry.create({
    customer: customers[1]._id,
    customerSnapshot: { name: customers[1].name, phone: customers[1].phone, email: customers[1].email },
    source: "website", eventDate: daysAhead(12), guestCount: 20,
    size: "500 g", flavours: "Chocolate truffle", designNotes: "Daughter's first birthday — something with unicorns.",
    budgetRange: "₹1,500 – ₹2,500", status: "awaiting_confirmation", quotedAmount: 2200,
    fulfilmentPref: { type: "pickup" },
  });
  await Enquiry.create({
    customerSnapshot: { name: "Kavita Nair", phone: "9820055667", email: "kavita.n@example.com" },
    customer: await Customer.create({ name: "Kavita Nair", phone: "9820055667", email: "kavita.n@example.com", leadSource: "referral" }),
    source: "other", eventDate: daysAhead(30), guestCount: 50,
    flavours: "Eggless vanilla + seasonal fruit", designNotes: "50th anniversary, elegant white and silver.",
    budgetRange: "₹6,000 – ₹8,000", status: "new", fulfilmentPref: { type: "delivery", address: "Andheri West" },
  });

  console.log("✅ Seed complete:");
  console.log(`   ${categories.length} categories, ${products.length} products, ${customers.length + 1} customers, ${orders.length} orders, 3 invoices, ${expenses.length} expenses, 3 enquiries`);
  console.log(`   Login: ${owner.email} / ${process.env.OWNER_PASSWORD || "Cakestyles@123"}`);

  await mongoose.disconnect();
};

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
