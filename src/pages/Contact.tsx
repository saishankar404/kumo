import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { GithubIcon, LinkedinIcon } from "@hugeicons/core-free-icons";

const fontStack = "'Satoshi', 'GT Walsheim Pro', system-ui, -apple-system, sans-serif";

const Contact = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

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
              get in touch
            </h1>
            <p className="text-[18px] md:text-[20px] leading-[1.7] text-gray-500 max-w-xl mx-auto" style={{ fontFamily: fontStack }}>
              Found a paper that refuses to show up? A bug to report? Or just want to say hi?
            </p>
          </motion.div>

          {/* Contact Content */}
          <motion.div 
            className="space-y-12 border-t border-gray-200 pt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Section 1: The Honest Message */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                honestly?
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                I'm probably procrastinating anyway. So go ahead, send that message. Whether it's a feature request, a weird edge case that's breaking your search, or you just want to tell me about a cool paper you found - I'm here for it.
              </p>
            </section>

            {/* Section 2: Email */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                drop an email
              </h2>
              <a 
                href="mailto:saishankar2803@gmail.com?subject=Hey%20from%20Kumo"
                className="text-[19px] leading-[1.8] text-sky-600 hover:text-sky-700 underline underline-offset-4 transition-colors"
                style={{ fontFamily: fontStack }}
              >
                saishankar2803@gmail.com
              </a>
            </section>

            {/* Section 3: Social Links */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                find me elsewhere
              </h2>
              <div className="flex flex-wrap gap-4">
                <a 
                  href="https://github.com/saishankar404/kumo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-6 py-4 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors group"
                >
                  <HugeiconsIcon icon={GithubIcon} size={24} strokeWidth={1.5} className="text-gray-900 group-hover:scale-110 transition-transform" />
                  <span className="text-[17px] font-medium text-gray-900" style={{ fontFamily: fontStack }}>GitHub</span>
                </a>
                <a 
                  href="https://www.linkedin.com/in/sai-shankar101/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-6 py-4 bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors group"
                >
                  <HugeiconsIcon icon={LinkedinIcon} size={24} strokeWidth={1.5} className="text-gray-900 group-hover:scale-110 transition-transform" />
                  <span className="text-[17px] font-medium text-gray-900" style={{ fontFamily: fontStack }}>LinkedIn</span>
                </a>
              </div>
            </section>

            {/* Section 4: What to expect */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                what happens next?
              </h2>
              <ul className="text-[19px] leading-[1.8] text-gray-600 space-y-4" style={{ fontFamily: fontStack }}>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <span>I'll actually read it (unlike those papers behind paywalls)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <span>I'll try to respond within 48 hours (unless I'm deep in a research rabbit hole)</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-400">•</span>
                  <span>No spam, no newsletters, no "join my Discord" - just a real human response</span>
                </li>
              </ul>
            </section>

            {/* CTA / Search Section */}
            <motion.section 
              className="pt-28 pb-40 text-center border-t border-gray-200 mt-24"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h2 className="text-[28px] md:text-[32px] font-medium tracking-tight mb-14 text-gray-900" style={{ fontFamily: fontStack }}>
                or just find a paper
              </h2>
              
              {/* Search Omnibar */}
              <form onSubmit={handleSearch} className="relative max-w-[640px] mx-auto group">
                <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
                  <Search className="h-6 w-6 text-gray-400 group-focus-within:text-gray-600 transition-colors" />
                </div>
                <input 
                  ref={inputRef}
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="search by doi, title, author, or keyword..." 
                  className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white border border-gray-200 focus:border-gray-400 rounded-2xl pl-16 pr-16 py-6 text-[19px] placeholder-gray-400 text-gray-900 transition-all outline-none shadow-sm focus:shadow-md"
                  style={{ fontFamily: fontStack }}
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center rounded-full bg-gray-200 p-1.5 text-gray-500 transition-all hover:scale-110 hover:bg-gray-300 hover:text-gray-800"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
            </motion.section>
            
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Contact;