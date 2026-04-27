import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const fontStack = "'Satoshi', 'GT Walsheim Pro', system-ui, -apple-system, sans-serif";

const Privacy = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-white text-gray-900 flex flex-col min-h-screen relative">
      {/* Background Image */}
      <div 
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          backgroundImage: "url(/about_bg.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          opacity: 0.2,
        }}
      />

      {/* Back Button */}
      <motion.button
        onClick={() => navigate("/")}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed top-8 left-8 text-[15px] font-medium text-gray-400 hover:text-gray-900 transition-colors z-50 flex items-center gap-2 bg-transparent border-none cursor-pointer"
        style={{ fontFamily: fontStack }}
      >
        <span className="text-xl leading-none">←</span>
        <span>back</span>
      </motion.button>

      {/* Main Content Area */}
      <main className="flex-1 flex justify-center w-full p-8 md:p-16 lg:p-24 overflow-y-auto relative z-10">
        <div className="max-w-[800px] w-full mx-auto mt-8 md:mt-12">
          
          {/* Intro / Header */}
          <motion.div 
            className="text-center mb-8 md:mb-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="mb-8">
              <img 
                src="/new_logo_no_bg.png" 
                alt="Kumo"
                className="h-40 w-auto object-contain mx-auto"
              />
            </div>
            <h1 className="text-3xl md:text-4xl font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
              privacy policy
            </h1>
            <p className="text-[18px] md:text-[20px] leading-[1.7] text-gray-500 max-w-xl mx-auto" style={{ fontFamily: fontStack }}>
              your data stays yours. period.
            </p>
          </motion.div>

          {/* Privacy Content */}
          <motion.div 
            className="space-y-10 border-t border-gray-200 pt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Section 1 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                what we collect
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                practically nothing. kumo doesn't require an account, doesn't ask for your email (unless you voluntarily contact us), and doesn't store your search history on any server.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                local storage
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                if you do use features like search history, it's stored locally in your browser - only you can see it, and you can clear it anytime. we have no access to it.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                third-party services
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                we use PostHog for analytics to understand how people use kumo - but it's anonymized. no personal data, no tracking across other sites, no cookies that persist after you close the browser.
              </p>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                papers & content
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                when you access papers through kumo, you're directly connecting to open-access sources (arXiv, CORE, Unpaywall, etc.). we don't store or cache any of that content - it's between you and the source.
              </p>
            </section>

            {/* Section 5 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                your rights
              </h2>
              <ul className="text-[19px] leading-[1.8] text-gray-600 space-y-4" style={{ fontFamily: fontStack }}>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <span>ask us to delete any data we might have (though there won't be much)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <span>opt out of analytics entirely (just don't load the site - okay, that's not practical)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <a href="mailto:saishankar2803@gmail.com" className="text-sky-600 hover:text-sky-700">saishankar2803@gmail.com</a>
                </li>
              </ul>
            </section>

            {/* Section 6 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                changes to this policy
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                if we ever change anything, we'll update this page. no sneaky moves, no hidden clauses. we're not in the business of surprising people with fine print.
              </p>
            </section>

            {/* Last updated */}
            <div className="pt-10 border-t border-gray-200">
              <p className="text-[16px] text-gray-400" style={{ fontFamily: fontStack }}>
                last updated: april 2026
              </p>
            </div>

          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Privacy;