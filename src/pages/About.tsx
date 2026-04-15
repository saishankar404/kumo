import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";

const fontStack = "'Satoshi', 'GT Walsheim Pro', system-ui, -apple-system, sans-serif";

const About = () => {
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
              what is kumo?
            </h1>
            <p className="text-[18px] md:text-[20px] leading-[1.7] text-gray-500 max-w-xl mx-auto" style={{ fontFamily: fontStack }}>
              an open research engine that doesn't look like it's from 2004. it is a frictionless way to find and read academic papers.
            </p>
          </motion.div>

          {/* Content Grid */}
          <motion.div 
            className="space-y-12 border-t border-gray-200 pt-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Section 1 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-4 text-gray-900" style={{ fontFamily: fontStack }}>
                why did we build it?
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                academic search is broken. it is gatekept by legacy publishers and served through clunky interfaces that actively fight against you. the internet evolved, but research tools didn't. we built kumo to fix the frontend of human knowledge and give you a tool that actually feels good to use.
              </p>
            </section>

            {/* Section 2 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                how does it work?
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                no paywall mazes, no pop-ups, no visual clutter. you drop a doi, an author, or a keyword. we bypass the friction and hand you the paper.
              </p>
            </section>

            {/* Section 3 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                the tech.
              </h2>
              <div className="space-y-5 text-[19px] leading-[1.8] text-gray-600" style={{ fontFamily: fontStack }}>
                <p>
                  kumo is a high-speed routing engine, not a massive storage drive. we don't host the files; we just built a much smarter bridge.
                </p>
                  <p>
                    when you search, kumo instantly queries the world's largest open-access APIs, like openalex and unpaywall. it scans metadata from over 240 million indexed papers in milliseconds.
                  </p>
                  <p>
                    instead of dropping you onto a publisher's login screen, our routing logic locates the legal, open-source pdf (hosted on university servers or arxiv) and delivers it directly in your browser.
                  </p>
                <p>
                  it is completely client-side. no database storing your search history, no accounts required, and zero trackers following you around.
                </p>
              </div>
            </section>

            {/* Section 4 */}
            <section>
              <h2 className="text-[24px] md:text-[26px] font-medium tracking-tight mb-6 text-gray-900" style={{ fontFamily: fontStack }}>
                our values.
              </h2>
              <p className="text-[19px] leading-[1.8] text-gray-600 italic mb-6" style={{ fontFamily: fontStack }}>
                kumo means cloud.<br />
                <span className="not-italic">it stands for what we believe human knowledge should be:</span>
              </p>
              <ul className="text-[19px] leading-[1.8] text-gray-600 space-y-5" style={{ fontFamily: fontStack }}>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-300">•</span>
                  <span><strong className="font-medium text-gray-900">open:</strong> information shouldn't be locked behind a $40 paywall.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-300">•</span>
                  <span><strong className="font-medium text-gray-900">frictionless:</strong> you shouldn't need a tutorial to download a pdf.</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-4 mt-1 text-gray-300">•</span>
                  <span><strong className="font-medium text-gray-900">respectful:</strong> software for researchers should respect your time and your eyes. speed and design matter.</span>
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
                ready to ditch the friction?
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

export default About;
