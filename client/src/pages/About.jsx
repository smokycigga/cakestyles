import { useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, Egg, Sparkles, Users } from "lucide-react";

export default function About() {
  useEffect(() => {
    document.title = "About — Cakestyles";
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-4xl font-semibold text-wine-800 text-center">About Cakestyles</h1>
        <p className="text-cocoa-500 leading-relaxed mt-6 text-center">
          Cakestyles began with a home oven, a family recipe book, and one belief: a cake should taste
          as good as it looks. Today we're a small studio bakery crafting 100% vegetarian, eggless
          cakes, brownies, cheesecakes and desserts — made fresh for every single order.
        </p>
        <p className="text-cocoa-500 leading-relaxed mt-4 text-center">
          We obsess over ingredients — real Belgian chocolate, fresh cream, seasonal fruit — and
          finish every bake by hand. Whether it's a box of brownies for the office or a three-tier
          wedding cake, it gets the same care.
        </p>
      </motion.div>

      <div className="grid sm:grid-cols-3 gap-5 mt-10">
        {[
          { icon: Egg, title: "100% Veg & Eggless", text: "Our entire menu — no exceptions, no egg-based shortcuts." },
          { icon: Heart, title: "Fresh, Never Frozen", text: "Every cake is baked after you order it." },
          { icon: Users, title: "Made for Celebrations", text: "Thousands of birthdays, weddings and milestones." },
        ].map(({ icon: Icon, title, text }) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl border border-wine-100 p-5 text-center"
          >
            <div className="w-11 h-11 mx-auto rounded-full bg-wine-50 flex items-center justify-center mb-3">
              <Icon className="w-5 h-5 text-wine-600" />
            </div>
            <h3 className="font-medium text-cocoa-900 text-sm">{title}</h3>
            <p className="text-xs text-cocoa-500 mt-1.5 leading-relaxed">{text}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-12 rounded-3xl overflow-hidden grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <img
            key={n}
            src={`/images/gallery/gallery${n}.jpg`}
            alt="Cakestyles bakes"
            loading="lazy"
            className="aspect-square object-cover rounded-xl"
          />
        ))}
      </div>

      <div className="mt-10 text-center">
        <div className="inline-flex items-center gap-2 text-wine-600 text-sm font-medium">
          <Sparkles className="w-4 h-4" /> Follow our daily bakes on Instagram @cakestyles
        </div>
      </div>
    </div>
  );
}
